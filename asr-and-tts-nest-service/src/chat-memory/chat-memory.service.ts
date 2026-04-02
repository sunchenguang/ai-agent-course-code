import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ImageKnowledgeService } from '../image-knowledge/image-knowledge.service';

const COLLECTION_NAME = 'chat_memory';
const VECTOR_DIM = 1024;

@Injectable()
export class ChatMemoryService implements OnModuleInit {
  private client: MilvusClient;
  private embeddings: OpenAIEmbeddings;
  private chatModel: ChatOpenAI;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor(
    private configService: ConfigService,
    private readonly imageKnowledge: ImageKnowledgeService,
  ) {
    this.client = new MilvusClient({
      address: this.configService.get('MILVUS_ADDRESS') || 'localhost:19530',
    });

    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get('OPENAI_API_KEY'),
      model: this.configService.get('EMBEDDINGS_MODEL_NAME') || 'text-embedding-v3',
      configuration: {
        baseURL: this.configService.get('OPENAI_BASE_URL'),
      },
      dimensions: VECTOR_DIM,
    });

    this.chatModel = new ChatOpenAI({
      model: this.configService.get('MODEL_NAME'),
      apiKey: this.configService.get('OPENAI_API_KEY'),
      configuration: {
        baseURL: this.configService.get('OPENAI_BASE_URL'),
      },
      temperature: 0.7,
    });

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '。', '！', '？', '；', ' '],
    });
  }

  async onModuleInit() {
    await this.initCollection();
  }

  private async initCollection() {
    try {
      await this.client.connectPromise;
      console.log('✓ Connected to Milvus');

      const hasCollection = await this.client.hasCollection({
        collection_name: COLLECTION_NAME,
      });

      if (!hasCollection.value) {
        console.log('Creating chat_memory collection...');
        await this.client.createCollection({
          collection_name: COLLECTION_NAME,
          fields: [
            { name: 'id', data_type: DataType.VarChar, max_length: 50, is_primary_key: true },
            { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIM },
            { name: 'content', data_type: DataType.VarChar, max_length: 5000 },
            { name: 'source', data_type: DataType.VarChar, max_length: 200 },
            { name: 'chunk_index', data_type: DataType.Int32 },
            { name: 'created_at', data_type: DataType.VarChar, max_length: 50 },
          ],
        });

        await this.client.createIndex({
          collection_name: COLLECTION_NAME,
          field_name: 'vector',
          index_type: IndexType.IVF_FLAT,
          metric_type: MetricType.COSINE,
          params: { nlist: 1024 },
        });

        console.log('✓ Collection and index created');
      }

      await this.client.loadCollection({ collection_name: COLLECTION_NAME });
      console.log('✓ Collection loaded');
    } catch (error) {
      console.error('Milvus initialization error:', error.message);
    }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }

  async insertChatContent(content: string, source: string = 'chat'): Promise<{ inserted: number | string }> {
    const chunks = await this.textSplitter.splitText(content);
    const timestamp = new Date().toISOString();
    const baseId = Date.now().toString(36);

    const data = await Promise.all(
      chunks.map(async (chunk, index) => ({
        id: `${baseId}_${index}`,
        vector: await this.getEmbedding(chunk),
        content: chunk,
        source,
        chunk_index: index,
        created_at: timestamp,
      })),
    );

    const result = await this.client.insert({
      collection_name: COLLECTION_NAME,
      data,
    });

    return { inserted: result.insert_cnt };
  }

  async searchSimilar(query: string, limit: number = 3): Promise<any[]> {
    const queryVector = await this.getEmbedding(query);

    const searchResult = await this.client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'content', 'source', 'chunk_index', 'created_at'],
    });

    return searchResult.results;
  }

  async *askQuestion(
    question: string,
    limit: number = 3,
    options?: { includeImageSearch?: boolean; imageSearchLimit?: number },
  ): AsyncGenerator<string> {
    const relevantChunks = await this.searchSimilar(question, limit);

    if (relevantChunks.length === 0) {
      yield '抱歉，没有找到相关的聊天记录内容。';
      return;
    }

    let context = relevantChunks
      .map((chunk, i) => `[片段 ${i + 1}] (相似度: ${chunk.score.toFixed(4)})\n${chunk.content}`)
      .join('\n\n---\n\n');

    if (options?.includeImageSearch) {
      try {
        const imgLimit = options.imageSearchLimit ?? 5;
        const hits = await this.imageKnowledge.searchForQuery(question.trim(), imgLimit);
        if (hits.length > 0) {
          context +=
            '\n\n---\n\n以下是与问题相关的图片知识库条目（说明与链接来自图库检索，可作补充参考）：\n\n' +
            this.imageKnowledge.formatHitsForPrompt(hits);
        }
      } catch (err) {
        console.warn(
          'image-knowledge 检索已跳过:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    const prompt = `你是一个温暖贴心的 AI 助手，专门帮助用户回忆和分析他们与女朋友的聊天记录。

请根据以下聊天记录内容回答问题：

${context}

用户问题: ${question}

回答要求：
1. 结合聊天记录内容给出详细、温暖的回答
2. 如果涉及多段内容，可以总结共同点或趋势
3. 用亲切自然的语言回答
4. 如果记录中没有相关信息，请温和地告知用户

AI 助手的回答:`;

    const stream = await this.chatModel.stream(prompt);
    for await (const chunk of stream) {
      if (chunk.content) {
        yield chunk.content as string;
      }
    }
  }

  async deleteAll(): Promise<{ deleted: boolean }> {
    try {
      await this.client.dropCollection({ collection_name: COLLECTION_NAME });
      await this.initCollection();
      return { deleted: true };
    } catch (error) {
      console.error('Delete error:', error.message);
      return { deleted: false };
    }
  }
}

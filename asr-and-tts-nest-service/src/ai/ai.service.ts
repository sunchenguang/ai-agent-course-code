import { Inject, Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import type { Runnable } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AI_TTS_STREAM_EVENT, type AiTtsStreamEvent } from '../common/stream-events';
import { ImageKnowledgeService } from '../image-knowledge/image-knowledge.service';

@Injectable()
export class AiService {
  private readonly chain: Runnable;

  constructor(
    @Inject('CHAT_MODEL') model: ChatOpenAI,
    private readonly eventEmitter: EventEmitter2,
    private readonly imageKnowledge: ImageKnowledgeService,
  ) {
    const prompt = PromptTemplate.fromTemplate('请回答以下问题：\n\n{query}');
    this.chain = prompt.pipe(model).pipe(new StringOutputParser());
  }

  async *streamChain(
    query: string,
    ttsSessionId?: string,
    useImages = false,
  ): AsyncGenerator<string> {
    let augmentedQuery = query;
    if (useImages && query?.trim()) {
      try {
        const hits = await this.imageKnowledge.searchForQuery(query.trim(), 5);
        if (hits.length > 0) {
          const block = this.imageKnowledge.formatHitsForPrompt(hits);
          augmentedQuery = `以下是与用户问题可能相关的图片说明（含可访问链接），请结合有用的信息回答；若与用户问题无关可忽略。\n\n${block}\n\n用户问题：\n${query}`;
        }
      } catch (err) {
        console.warn('image-knowledge 检索已跳过:', err instanceof Error ? err.message : err);
      }
    }

    try {
      const stream = await this.chain.stream({ query: augmentedQuery });
      for await (const chunk of stream) {
        if (ttsSessionId) {
          const event: AiTtsStreamEvent = {
            type: 'chunk',
            sessionId: ttsSessionId,
            chunk,
          };
          this.eventEmitter.emit(AI_TTS_STREAM_EVENT, event);
        }
        yield chunk;
      }
      if (ttsSessionId) {
        const endEvent: AiTtsStreamEvent = { type: 'end', sessionId: ttsSessionId };
        this.eventEmitter.emit(AI_TTS_STREAM_EVENT, endEvent);
      }
    } catch (error) {
      if (ttsSessionId) {
        const errorEvent: AiTtsStreamEvent = {
          type: 'error',
          sessionId: ttsSessionId,
          error: error instanceof Error ? error.message : String(error),
        };
        this.eventEmitter.emit(AI_TTS_STREAM_EVENT, errorEvent);
      }
      throw error;
    }
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import type { Runnable } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { AIMessageChunk, createAgent } from 'langchain';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UIMessage } from 'ai';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import {
  AI_TTS_STREAM_EVENT,
  type AiTtsStreamEvent,
} from '../common/stream-events';
import { ImageKnowledgeService } from '../image-knowledge/image-knowledge.service';

@Injectable()
export class AiService {
  private readonly chain: Runnable;
  private readonly agent: ReturnType<typeof createAgent>;

  constructor(
    @Inject('CHAT_MODEL') private readonly model: ChatOpenAI,
    @Inject('WEB_SEARCH_TOOL')
    private readonly webSearchTool: StructuredToolInterface,
    private readonly eventEmitter: EventEmitter2,
    private readonly imageKnowledge: ImageKnowledgeService,
  ) {
    const prompt = PromptTemplate.fromTemplate('请回答以下问题：\n\n{query}');
    this.chain = prompt.pipe(this.model).pipe(new StringOutputParser());
    this.agent = createAgent({
      model: this.model,
      tools: [this.webSearchTool],
      systemPrompt:
        '你是 AI 助手。需要最新信息、事实核查或联网信息时，请使用 web_search 工具搜索后再作答。',
    });
  }

  /**
   * Vercel AI SDK（UIMessage）流式输出，供 useChat / DefaultChatTransport 等客户端使用。
   * 内置 web_search（Bocha），工具调用会进入 UI 消息流。
   */
  async streamSdkChat(messages: UIMessage[], useImages = false) {
    let lcMessages = await toBaseMessages(messages);
    lcMessages = await this.applyImageContextToMessages(lcMessages, useImages);
    const lgStream = await this.agent.stream(
      { messages: lcMessages },
      {
        streamMode: ['messages', 'values'],
        recursionLimit: 30,
      },
    );
    return toUIMessageStream(lgStream as AsyncIterable<AIMessageChunk>);
  }

  private getPlainTextFromHumanMessage(msg: HumanMessage): string {
    const c = msg.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          if (typeof part === 'string') return part;
          if (
            part &&
            typeof part === 'object' &&
            'type' in part &&
            (part as { type: string }).type === 'text' &&
            'text' in part
          ) {
            return String((part as { text: string }).text);
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  private async applyImageContextToMessages(
    messages: BaseMessage[],
    useImages: boolean,
  ): Promise<BaseMessage[]> {
    if (!useImages || messages.length === 0) return messages;

    let lastHumanIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]._getType() === 'human') {
        lastHumanIdx = i;
        break;
      }
    }
    if (lastHumanIdx < 0) return messages;

    const hm = messages[lastHumanIdx] as HumanMessage;
    const query = this.getPlainTextFromHumanMessage(hm).trim();
    if (!query) return messages;

    let augmentedQuery = query;
    try {
      const hits = await this.imageKnowledge.searchForQuery(query, 5);
      if (hits.length > 0) {
        const block = this.imageKnowledge.formatHitsForPrompt(hits);
        augmentedQuery = `以下是与用户问题可能相关的图片说明（含可访问链接），请结合有用的信息回答；若与用户问题无关可忽略。\n\n${block}\n\n用户问题：\n${query}`;
      }
    } catch (err) {
      console.warn(
        'image-knowledge 检索已跳过:',
        err instanceof Error ? err.message : err,
      );
    }

    if (augmentedQuery === query) return messages;

    const next = messages.slice();
    next[lastHumanIdx] = new HumanMessage(augmentedQuery);
    return next;
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
        console.warn(
          'image-knowledge 检索已跳过:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    try {
      const stream = await this.chain.stream({ query: augmentedQuery });
      for await (const chunk of stream) {
        const text = typeof chunk === 'string' ? chunk : String(chunk);
        if (ttsSessionId) {
          const event: AiTtsStreamEvent = {
            type: 'chunk',
            sessionId: ttsSessionId,
            chunk: text,
          };
          this.eventEmitter.emit(AI_TTS_STREAM_EVENT, event);
        }
        yield text;
      }
      if (ttsSessionId) {
        const endEvent: AiTtsStreamEvent = {
          type: 'end',
          sessionId: ttsSessionId,
        };
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

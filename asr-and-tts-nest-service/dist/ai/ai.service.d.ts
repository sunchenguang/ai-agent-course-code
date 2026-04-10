import { ChatOpenAI } from '@langchain/openai';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UIMessage } from 'ai';
import { ImageKnowledgeService } from '../image-knowledge/image-knowledge.service';
export declare class AiService {
    private readonly model;
    private readonly webSearchTool;
    private readonly eventEmitter;
    private readonly imageKnowledge;
    private readonly chain;
    private readonly agent;
    constructor(model: ChatOpenAI, webSearchTool: StructuredToolInterface, eventEmitter: EventEmitter2, imageKnowledge: ImageKnowledgeService);
    streamSdkChat(messages: UIMessage[], useImages?: boolean): Promise<ReadableStream<import("ai").UIMessageChunk>>;
    private getPlainTextFromHumanMessage;
    private applyImageContextToMessages;
    streamChain(query: string, ttsSessionId?: string, useImages?: boolean): AsyncGenerator<string>;
}

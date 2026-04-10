import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageKnowledgeService } from '../image-knowledge/image-knowledge.service';
export declare class ChatMemoryService implements OnModuleInit {
    private configService;
    private readonly imageKnowledge;
    private client;
    private embeddings;
    private chatModel;
    private textSplitter;
    constructor(configService: ConfigService, imageKnowledge: ImageKnowledgeService);
    onModuleInit(): Promise<void>;
    private initCollection;
    private getEmbedding;
    insertChatContent(content: string, source?: string): Promise<{
        inserted: number | string;
    }>;
    searchSimilar(query: string, limit?: number): Promise<any[]>;
    askQuestion(question: string, limit?: number, options?: {
        includeImageSearch?: boolean;
        imageSearchLimit?: number;
    }): AsyncGenerator<string>;
    deleteAll(): Promise<{
        deleted: boolean;
    }>;
}

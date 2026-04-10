import type { Response } from 'express';
import { ChatMemoryService } from './chat-memory.service';
export declare class ChatMemoryController {
    private readonly chatMemoryService;
    constructor(chatMemoryService: ChatMemoryService);
    insertChat(content: string, source?: string): Promise<{
        success: boolean;
        message: string;
    } | {
        inserted: number | string;
        success: boolean;
        message?: undefined;
    }>;
    search(query: string, limit?: string): Promise<{
        success: boolean;
        message: string;
        results?: undefined;
    } | {
        success: boolean;
        results: any[];
        message?: undefined;
    }>;
    ask(question: string, limit: string, searchImages: string, res: Response): Promise<void>;
    deleteAll(): Promise<{
        success: boolean;
    }>;
}

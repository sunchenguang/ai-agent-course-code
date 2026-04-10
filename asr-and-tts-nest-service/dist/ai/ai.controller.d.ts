import type { Response } from 'express';
import { Observable } from 'rxjs';
import { AiService } from './ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UIMessage } from 'ai';
export declare class AiController {
    private readonly aiService;
    private readonly eventEmitter;
    constructor(aiService: AiService, eventEmitter: EventEmitter2);
    postChat(body: {
        messages?: UIMessage[];
        useImages?: boolean;
    }, res: Response): Promise<void>;
    chatStream(query: string, ttsSessionId?: string, useImages?: string): Observable<{
        data: string;
    }>;
}

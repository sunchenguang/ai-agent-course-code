import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AiTtsStreamEvent } from '../common/stream-events';
import WebSocket from 'ws';
export declare class TtsRelayService implements OnModuleDestroy {
    private readonly logger;
    private readonly sessions;
    private readonly secretId;
    private readonly secretKey;
    private readonly appId;
    private readonly voiceType;
    constructor(configService: ConfigService);
    onModuleDestroy(): void;
    registerClient(clientWs: WebSocket, wantedSessionId?: string): string;
    unregisterClient(sessionId: string): void;
    handleAiStreamEvent(event: AiTtsStreamEvent): void;
    private ensureTencentConnection;
    private flushPendingChunks;
    private sendTencentChunk;
    private closeSession;
    private sendClientJson;
    private buildTencentTtsWsUrl;
}

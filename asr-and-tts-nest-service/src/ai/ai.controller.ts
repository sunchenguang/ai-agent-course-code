import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  Res,
  Sse,
} from '@nestjs/common';
import type { Response } from 'express';
import { from, map, Observable } from 'rxjs';
import { AiService } from './ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { pipeUIMessageStreamToResponse, UIMessage } from 'ai';
import {
  AI_TTS_STREAM_EVENT,
  type AiTtsStreamEvent,
} from '../common/stream-events';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Vercel AI SDK UI Message 流（POST + SSE），与 agui-backend `POST /ai/chat` 一致。
   *
   * 本地测试：
   * curl -N -sS -X POST 'http://localhost:3000/ai/chat' \
   *   -H 'Content-Type: application/json' \
   *   -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"你好"}]}]}'
   */
  @Post('chat')
  async postChat(
    @Body() body: { messages?: UIMessage[]; useImages?: boolean },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!body?.messages || !Array.isArray(body.messages)) {
      throw new BadRequestException('Invalid JSON');
    }
    const useImages = body.useImages === true;
    const stream = await this.aiService.streamSdkChat(body.messages, useImages);
    pipeUIMessageStreamToResponse({ response: res, stream });
  }

  @Sse('chat/stream')
  chatStream(
    @Query('query') query: string,
    @Query('ttsSessionId') ttsSessionId?: string,
    @Query('useImages') useImages?: string,
  ): Observable<{ data: string }> {
    const sessionId = ttsSessionId?.trim();
    const withImages = useImages === 'true' || useImages === '1';
    if (sessionId) {
      const startEvent: AiTtsStreamEvent = { type: 'start', sessionId, query };
      this.eventEmitter.emit(AI_TTS_STREAM_EVENT, startEvent);
    }

    return from(this.aiService.streamChain(query, sessionId, withImages)).pipe(
      map((chunk) => ({ data: chunk })),
    );
  }
}

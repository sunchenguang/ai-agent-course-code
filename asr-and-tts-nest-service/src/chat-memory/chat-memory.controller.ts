import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatMemoryService } from './chat-memory.service';

@Controller('chat-memory')
export class ChatMemoryController {
  constructor(private readonly chatMemoryService: ChatMemoryService) {}

  @Post('insert')
  async insertChat(
    @Body('content') content: string,
    @Body('source') source?: string,
  ) {
    if (!content) {
      return { success: false, message: '内容不能为空' };
    }
    const result = await this.chatMemoryService.insertChatContent(content, source);
    return { success: true, ...result };
  }

  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      return { success: false, message: '查询内容不能为空' };
    }
    const results = await this.chatMemoryService.searchSimilar(query, limit ? parseInt(limit) : 3);
    return { success: true, results };
  }

  @Get('ask')
  async ask(
    @Query('q') question: string,
    @Query('limit') limit: string,
    @Query('searchImages') searchImages: string,
    @Res() res: Response,
  ) {
    if (!question) {
      res.status(400).json({ success: false, message: '问题不能为空' });
      return;
    }

    const includeImageSearch =
      searchImages === '1' ||
      searchImages === 'true' ||
      searchImages?.toLowerCase() === 'yes';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const stream = this.chatMemoryService.askQuestion(question, limit ? parseInt(limit) : 3, {
        includeImageSearch,
      });
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('delete-all')
  async deleteAll() {
    const result = await this.chatMemoryService.deleteAll();
    return { success: result.deleted };
  }
}

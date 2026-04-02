import { Module } from '@nestjs/common';
import { ChatMemoryService } from './chat-memory.service';
import { ChatMemoryController } from './chat-memory.controller';

@Module({
  controllers: [ChatMemoryController],
  providers: [ChatMemoryService],
  exports: [ChatMemoryService],
})
export class ChatMemoryModule {}

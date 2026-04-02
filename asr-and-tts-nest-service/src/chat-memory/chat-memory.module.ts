import { Module } from '@nestjs/common';
import { ImageKnowledgeModule } from '../image-knowledge/image-knowledge.module';
import { ChatMemoryService } from './chat-memory.service';
import { ChatMemoryController } from './chat-memory.controller';

@Module({
  imports: [ImageKnowledgeModule],
  controllers: [ChatMemoryController],
  providers: [ChatMemoryService],
  exports: [ChatMemoryService],
})
export class ChatMemoryModule {}

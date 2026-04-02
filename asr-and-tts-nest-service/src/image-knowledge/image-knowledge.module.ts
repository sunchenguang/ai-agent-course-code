import { Module } from '@nestjs/common';
import { ImageKnowledgeService } from './image-knowledge.service';
import { ImageKnowledgeController } from './image-knowledge.controller';

@Module({
  controllers: [ImageKnowledgeController],
  providers: [ImageKnowledgeService],
  exports: [ImageKnowledgeService],
})
export class ImageKnowledgeModule {}

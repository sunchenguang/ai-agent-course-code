import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ImageKnowledgeService } from './image-knowledge.service';

@Controller('image-knowledge')
export class ImageKnowledgeController {
  constructor(private readonly imageKnowledgeService: ImageKnowledgeService) {}

  /** 仅预览：根据链接生成简短说明，不入库。 */
  @Post('preview-description')
  async previewDescription(@Body('imageUrl') imageUrl: string) {
    if (!imageUrl?.trim()) {
      return { success: false, message: '缺少 imageUrl' };
    }
    try {
      const { description, metadata } = await this.imageKnowledgeService.analyzeImageUrl(imageUrl.trim());
      return { success: true, description, metadata };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  /** 提交 OSS 可访问链接；自动生成描述并入库（也可传 description 跳过视觉模型）。 */
  @Post()
  async create(
    @Body('imageUrl') imageUrl: string,
    @Body('title') title?: string,
    @Body('tags') tags?: string,
    @Body('description') description?: string,
  ) {
    if (!imageUrl) {
      return { success: false, message: '缺少 imageUrl' };
    }
    try {
      const record = await this.imageKnowledgeService.createFromOssUrl({
        imageUrl,
        title,
        tags,
        description,
      });
      return { success: true, record };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  @Get()
  list() {
    return { success: true, records: this.imageKnowledgeService.listAll() };
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return { success: true, record: this.imageKnowledgeService.getByIdOrThrow(id) };
    } catch {
      return { success: false, message: '记录不存在' };
    }
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('title') title?: string,
    @Body('description') description?: string,
    @Body('tags') tags?: string,
  ) {
    try {
      const record = await this.imageKnowledgeService.updateRecord(id, {
        title,
        description,
        tags,
      });
      return { success: true, record };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const ok = await this.imageKnowledgeService.deleteRecord(id);
    return { success: ok, deleted: ok };
  }
}

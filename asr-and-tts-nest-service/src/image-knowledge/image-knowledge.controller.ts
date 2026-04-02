import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageKnowledgeService } from './image-knowledge.service';

@Controller('image-knowledge')
export class ImageKnowledgeController {
  constructor(private readonly imageKnowledgeService: ImageKnowledgeService) {}

  /** 上传聊天截图等图片，识别图中文字（依赖 VISION_MODEL_NAME / 多模态模型）。 */
  @Post('ocr-text')
  @UseInterceptors(FileInterceptor('image'))
  async ocrChatImage(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      mimetype: string;
      size: number;
    },
  ) {
    if (!file?.buffer?.length) {
      return { success: false, message: '请通过 FormData 的 image 字段上传图片' };
    }
    try {
      const text = await this.imageKnowledgeService.extractTextFromImageBuffer(
        file.buffer,
        file.mimetype,
      );
      return { success: true, text };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

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

  /** 按问题语义检索图库（需在 :id 路由之前声明）。 */
  @Get('search')
  async searchByQuery(@Query('q') q: string, @Query('limit') limit?: string) {
    if (!q?.trim()) {
      return { success: false, message: '查询内容不能为空' };
    }
    try {
      const results = await this.imageKnowledgeService.searchForQuery(
        q.trim(),
        limit ? parseInt(limit, 10) : 5,
      );
      return { success: true, results };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
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

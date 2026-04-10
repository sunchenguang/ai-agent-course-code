"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageKnowledgeController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const image_knowledge_service_1 = require("./image-knowledge.service");
let ImageKnowledgeController = class ImageKnowledgeController {
    imageKnowledgeService;
    constructor(imageKnowledgeService) {
        this.imageKnowledgeService = imageKnowledgeService;
    }
    async ocrChatImage(file) {
        if (!file?.buffer?.length) {
            return { success: false, message: '请通过 FormData 的 image 字段上传图片' };
        }
        try {
            const text = await this.imageKnowledgeService.extractTextFromImageBuffer(file.buffer, file.mimetype);
            return { success: true, text };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
    async previewDescription(imageUrl) {
        if (!imageUrl?.trim()) {
            return { success: false, message: '缺少 imageUrl' };
        }
        try {
            const { description, metadata } = await this.imageKnowledgeService.analyzeImageUrl(imageUrl.trim());
            return { success: true, description, metadata };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
    async create(imageUrl, title, tags, description) {
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
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
    list() {
        return { success: true, records: this.imageKnowledgeService.listAll() };
    }
    async searchByQuery(q, limit) {
        if (!q?.trim()) {
            return { success: false, message: '查询内容不能为空' };
        }
        try {
            const results = await this.imageKnowledgeService.searchForQuery(q.trim(), limit ? parseInt(limit, 10) : 5);
            return { success: true, results };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
    getOne(id) {
        try {
            return { success: true, record: this.imageKnowledgeService.getByIdOrThrow(id) };
        }
        catch {
            return { success: false, message: '记录不存在' };
        }
    }
    async update(id, title, description, tags) {
        try {
            const record = await this.imageKnowledgeService.updateRecord(id, {
                title,
                description,
                tags,
            });
            return { success: true, record };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
    async remove(id) {
        const ok = await this.imageKnowledgeService.deleteRecord(id);
        return { success: ok, deleted: ok };
    }
};
exports.ImageKnowledgeController = ImageKnowledgeController;
__decorate([
    (0, common_1.Post)('ocr-text'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('image')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImageKnowledgeController.prototype, "ocrChatImage", null);
__decorate([
    (0, common_1.Post)('preview-description'),
    __param(0, (0, common_1.Body)('imageUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ImageKnowledgeController.prototype, "previewDescription", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)('imageUrl')),
    __param(1, (0, common_1.Body)('title')),
    __param(2, (0, common_1.Body)('tags')),
    __param(3, (0, common_1.Body)('description')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ImageKnowledgeController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ImageKnowledgeController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ImageKnowledgeController.prototype, "searchByQuery", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ImageKnowledgeController.prototype, "getOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('title')),
    __param(2, (0, common_1.Body)('description')),
    __param(3, (0, common_1.Body)('tags')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ImageKnowledgeController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ImageKnowledgeController.prototype, "remove", null);
exports.ImageKnowledgeController = ImageKnowledgeController = __decorate([
    (0, common_1.Controller)('image-knowledge'),
    __metadata("design:paramtypes", [image_knowledge_service_1.ImageKnowledgeService])
], ImageKnowledgeController);
//# sourceMappingURL=image-knowledge.controller.js.map
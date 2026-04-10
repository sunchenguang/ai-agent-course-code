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
exports.ChatMemoryController = void 0;
const common_1 = require("@nestjs/common");
const chat_memory_service_1 = require("./chat-memory.service");
let ChatMemoryController = class ChatMemoryController {
    chatMemoryService;
    constructor(chatMemoryService) {
        this.chatMemoryService = chatMemoryService;
    }
    async insertChat(content, source) {
        if (!content) {
            return { success: false, message: '内容不能为空' };
        }
        const result = await this.chatMemoryService.insertChatContent(content, source);
        return { success: true, ...result };
    }
    async search(query, limit) {
        if (!query) {
            return { success: false, message: '查询内容不能为空' };
        }
        const results = await this.chatMemoryService.searchSimilar(query, limit ? parseInt(limit) : 3);
        return { success: true, results };
    }
    async ask(question, limit, searchImages, res) {
        if (!question) {
            res.status(400).json({ success: false, message: '问题不能为空' });
            return;
        }
        const includeImageSearch = searchImages === '1' ||
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
        }
        catch (error) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        }
        finally {
            res.end();
        }
    }
    async deleteAll() {
        const result = await this.chatMemoryService.deleteAll();
        return { success: result.deleted };
    }
};
exports.ChatMemoryController = ChatMemoryController;
__decorate([
    (0, common_1.Post)('insert'),
    __param(0, (0, common_1.Body)('content')),
    __param(1, (0, common_1.Body)('source')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ChatMemoryController.prototype, "insertChat", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ChatMemoryController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('ask'),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('searchImages')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ChatMemoryController.prototype, "ask", null);
__decorate([
    (0, common_1.Post)('delete-all'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatMemoryController.prototype, "deleteAll", null);
exports.ChatMemoryController = ChatMemoryController = __decorate([
    (0, common_1.Controller)('chat-memory'),
    __metadata("design:paramtypes", [chat_memory_service_1.ChatMemoryService])
], ChatMemoryController);
//# sourceMappingURL=chat-memory.controller.js.map
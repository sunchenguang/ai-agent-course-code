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
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const ai_service_1 = require("./ai.service");
const event_emitter_1 = require("@nestjs/event-emitter");
const ai_1 = require("ai");
const stream_events_1 = require("../common/stream-events");
let AiController = class AiController {
    aiService;
    eventEmitter;
    constructor(aiService, eventEmitter) {
        this.aiService = aiService;
        this.eventEmitter = eventEmitter;
    }
    async postChat(body, res) {
        if (!body?.messages || !Array.isArray(body.messages)) {
            throw new common_1.BadRequestException('Invalid JSON');
        }
        const useImages = body.useImages === true;
        const stream = await this.aiService.streamSdkChat(body.messages, useImages);
        (0, ai_1.pipeUIMessageStreamToResponse)({ response: res, stream });
    }
    chatStream(query, ttsSessionId, useImages) {
        const sessionId = ttsSessionId?.trim();
        const withImages = useImages === 'true' || useImages === '1';
        if (sessionId) {
            const startEvent = { type: 'start', sessionId, query };
            this.eventEmitter.emit(stream_events_1.AI_TTS_STREAM_EVENT, startEvent);
        }
        return (0, rxjs_1.from)(this.aiService.streamChain(query, sessionId, withImages)).pipe((0, rxjs_1.map)((chunk) => ({ data: chunk })));
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Post)('chat'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: false })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "postChat", null);
__decorate([
    (0, common_1.Sse)('chat/stream'),
    __param(0, (0, common_1.Query)('query')),
    __param(1, (0, common_1.Query)('ttsSessionId')),
    __param(2, (0, common_1.Query)('useImages')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", rxjs_1.Observable)
], AiController.prototype, "chatStream", null);
exports.AiController = AiController = __decorate([
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService,
        event_emitter_1.EventEmitter2])
], AiController);
//# sourceMappingURL=ai.controller.js.map
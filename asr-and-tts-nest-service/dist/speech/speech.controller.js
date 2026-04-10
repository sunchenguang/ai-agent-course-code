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
exports.SpeechController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const speech_service_1 = require("./speech.service");
let SpeechController = class SpeechController {
    speechService;
    constructor(speechService) {
        this.speechService = speechService;
    }
    async recognize(file) {
        if (!file?.buffer?.length) {
            throw new common_1.BadRequestException('请通过 FormData 的 audio 字段上传音频文件');
        }
        const text = await this.speechService.recognizeBySentence(file);
        return { text };
    }
};
exports.SpeechController = SpeechController;
__decorate([
    (0, common_1.Post)('asr'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SpeechController.prototype, "recognize", null);
exports.SpeechController = SpeechController = __decorate([
    (0, common_1.Controller)('speech'),
    __metadata("design:paramtypes", [speech_service_1.SpeechService])
], SpeechController);
//# sourceMappingURL=speech.controller.js.map
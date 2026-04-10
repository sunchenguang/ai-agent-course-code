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
exports.SpeechService = void 0;
const common_1 = require("@nestjs/common");
let SpeechService = class SpeechService {
    asrClient;
    constructor(asrClient) {
        this.asrClient = asrClient;
    }
    async recognizeBySentence(file) {
        const audioBase64 = file.buffer.toString('base64');
        const result = await this.asrClient.SentenceRecognition({
            EngSerViceType: '16k_zh',
            SourceType: 1,
            Data: audioBase64,
            DataLen: file.buffer.length,
            VoiceFormat: 'ogg-opus',
        });
        return result.Result ?? '';
    }
};
exports.SpeechService = SpeechService;
exports.SpeechService = SpeechService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('ASR_CLIENT')),
    __metadata("design:paramtypes", [Object])
], SpeechService);
//# sourceMappingURL=speech.service.js.map
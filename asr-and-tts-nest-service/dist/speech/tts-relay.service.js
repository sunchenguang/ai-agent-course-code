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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var TtsRelayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtsRelayService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const event_emitter_1 = require("@nestjs/event-emitter");
const stream_events_1 = require("../common/stream-events");
const ws_1 = __importDefault(require("ws"));
let TtsRelayService = TtsRelayService_1 = class TtsRelayService {
    logger = new common_1.Logger(TtsRelayService_1.name);
    sessions = new Map();
    secretId;
    secretKey;
    appId;
    voiceType;
    constructor(configService) {
        this.secretId = configService.get('SECRET_ID') ?? '';
        this.secretKey = configService.get('SECRET_KEY') ?? '';
        this.appId = Number(configService.get('APP_ID') ?? 0);
        this.voiceType = Number(configService.get('TTS_VOICE_TYPE') ?? 101001);
    }
    onModuleDestroy() {
        for (const session of this.sessions.values()) {
            this.closeSession(session.sessionId, 'module destroy');
        }
    }
    registerClient(clientWs, wantedSessionId) {
        const sessionId = wantedSessionId?.trim() || (0, node_crypto_1.randomUUID)();
        const existing = this.sessions.get(sessionId);
        if (existing) {
            this.closeSession(sessionId, 'client reconnected');
        }
        this.sessions.set(sessionId, {
            sessionId,
            clientWs,
            ready: false,
            pendingChunks: [],
            closed: false,
        });
        this.sendClientJson(clientWs, { type: 'session', sessionId });
        this.logger.log(`TTS client connected: ${sessionId}`);
        return sessionId;
    }
    unregisterClient(sessionId) {
        this.closeSession(sessionId, 'client disconnected');
    }
    handleAiStreamEvent(event) {
        const session = this.sessions.get(event.sessionId);
        if (!session)
            return;
        switch (event.type) {
            case 'start': {
                this.ensureTencentConnection(session);
                this.sendClientJson(session.clientWs, {
                    type: 'tts_started',
                    sessionId: session.sessionId,
                    query: event.query,
                });
                break;
            }
            case 'chunk': {
                const chunk = event.chunk?.trim();
                if (!chunk)
                    return;
                if (!session.ready || !session.tencentWs || session.tencentWs.readyState !== ws_1.default.OPEN) {
                    session.pendingChunks.push(chunk);
                    return;
                }
                this.sendTencentChunk(session, chunk);
                break;
            }
            case 'end': {
                this.flushPendingChunks(session);
                if (session.tencentWs && session.tencentWs.readyState === ws_1.default.OPEN) {
                    session.tencentWs.send(JSON.stringify({
                        session_id: session.sessionId,
                        action: 'ACTION_COMPLETE',
                    }));
                }
                break;
            }
            case 'error': {
                this.sendClientJson(session.clientWs, {
                    type: 'tts_error',
                    message: event.error,
                });
                this.closeSession(session.sessionId, 'ai stream error');
                break;
            }
        }
    }
    ensureTencentConnection(session) {
        if (session.tencentWs && session.tencentWs.readyState <= ws_1.default.OPEN) {
            return;
        }
        if (!this.secretId || !this.secretKey || !this.appId) {
            this.sendClientJson(session.clientWs, {
                type: 'tts_error',
                message: 'TTS 凭证缺失，请检查 SECRET_ID/SECRET_KEY/APP_ID',
            });
            return;
        }
        const url = this.buildTencentTtsWsUrl(session.sessionId);
        const tencentWs = new ws_1.default(url);
        session.tencentWs = tencentWs;
        session.ready = false;
        tencentWs.on('open', () => {
            this.logger.log(`Tencent TTS ws opened: ${session.sessionId}`);
        });
        tencentWs.on('message', (data, isBinary) => {
            if (session.closed)
                return;
            if (isBinary) {
                if (session.clientWs.readyState === ws_1.default.OPEN) {
                    session.clientWs.send(data, { binary: true });
                }
                return;
            }
            const raw = data.toString();
            let msg;
            try {
                msg = JSON.parse(raw);
            }
            catch {
                return;
            }
            if (Number(msg.ready) === 1) {
                session.ready = true;
                this.flushPendingChunks(session);
            }
            if (Number(msg.code) && Number(msg.code) !== 0) {
                this.sendClientJson(session.clientWs, {
                    type: 'tts_error',
                    message: String(msg.message ?? 'Tencent TTS error'),
                    code: Number(msg.code),
                });
                this.closeSession(session.sessionId, 'tencent error');
                return;
            }
            if (Number(msg.final) === 1) {
                this.sendClientJson(session.clientWs, { type: 'tts_final' });
            }
        });
        tencentWs.on('error', (error) => {
            this.sendClientJson(session.clientWs, {
                type: 'tts_error',
                message: `Tencent ws error: ${error.message}`,
            });
        });
        tencentWs.on('close', () => {
            session.tencentWs = undefined;
            session.ready = false;
        });
    }
    flushPendingChunks(session) {
        if (!session.ready || !session.tencentWs || session.tencentWs.readyState !== ws_1.default.OPEN) {
            return;
        }
        while (session.pendingChunks.length > 0) {
            const chunk = session.pendingChunks.shift();
            if (!chunk)
                continue;
            this.sendTencentChunk(session, chunk);
        }
    }
    sendTencentChunk(session, text) {
        if (!session.tencentWs || session.tencentWs.readyState !== ws_1.default.OPEN) {
            session.pendingChunks.push(text);
            return;
        }
        session.tencentWs.send(JSON.stringify({
            session_id: session.sessionId,
            message_id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            action: 'ACTION_SYNTHESIS',
            data: text,
        }));
    }
    closeSession(sessionId, reason) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.closed = true;
        if (session.tencentWs && session.tencentWs.readyState < ws_1.default.CLOSING) {
            session.tencentWs.close();
        }
        if (session.clientWs.readyState < ws_1.default.CLOSING) {
            this.sendClientJson(session.clientWs, { type: 'tts_closed', reason });
            session.clientWs.close();
        }
        this.sessions.delete(sessionId);
        this.logger.log(`TTS session closed: ${sessionId}, reason: ${reason}`);
    }
    sendClientJson(clientWs, payload) {
        if (clientWs.readyState !== ws_1.default.OPEN)
            return;
        clientWs.send(JSON.stringify(payload));
    }
    buildTencentTtsWsUrl(sessionId) {
        const now = Math.floor(Date.now() / 1000);
        const params = {
            Action: 'TextToStreamAudioWSv2',
            AppId: this.appId,
            Codec: 'mp3',
            Expired: now + 3600,
            SampleRate: 16000,
            SecretId: this.secretId,
            SessionId: sessionId,
            Speed: 0,
            Timestamp: now,
            VoiceType: this.voiceType,
            Volume: 5,
        };
        const signStr = Object.keys(params)
            .sort()
            .map((k) => `${k}=${params[k]}`)
            .join('&');
        const rawStr = `GETtts.cloud.tencent.com/stream_wsv2?${signStr}`;
        const signature = (0, node_crypto_1.createHmac)('sha1', this.secretKey).update(rawStr).digest('base64');
        const searchParams = new URLSearchParams({
            ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
            Signature: signature,
        });
        return `wss://tts.cloud.tencent.com/stream_wsv2?${searchParams.toString()}`;
    }
};
exports.TtsRelayService = TtsRelayService;
__decorate([
    (0, event_emitter_1.OnEvent)(stream_events_1.AI_TTS_STREAM_EVENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TtsRelayService.prototype, "handleAiStreamEvent", null);
exports.TtsRelayService = TtsRelayService = TtsRelayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.ConfigService)),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TtsRelayService);
//# sourceMappingURL=tts-relay.service.js.map
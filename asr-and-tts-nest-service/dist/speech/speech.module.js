"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeechModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const speech_service_1 = require("./speech.service");
const speech_controller_1 = require("./speech.controller");
const tts_relay_service_1 = require("./tts-relay.service");
const tencentcloud = __importStar(require("tencentcloud-sdk-nodejs"));
const AsrClient = tencentcloud.asr.v20190614.Client;
let SpeechModule = class SpeechModule {
};
exports.SpeechModule = SpeechModule;
exports.SpeechModule = SpeechModule = __decorate([
    (0, common_1.Module)({
        providers: [
            speech_service_1.SpeechService,
            tts_relay_service_1.TtsRelayService,
            {
                provide: 'ASR_CLIENT',
                useFactory: (configService) => {
                    return new AsrClient({
                        credential: {
                            secretId: configService.get('SECRET_ID'),
                            secretKey: configService.get('SECRET_KEY'),
                        },
                        region: 'ap-shanghai',
                        profile: {
                            httpProfile: {
                                reqMethod: 'POST',
                                reqTimeout: 30,
                            },
                        },
                    });
                },
                inject: [config_1.ConfigService],
            },
        ],
        controllers: [speech_controller_1.SpeechController],
        exports: [tts_relay_service_1.TtsRelayService],
    })
], SpeechModule);
//# sourceMappingURL=speech.module.js.map
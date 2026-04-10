"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const node_path_1 = require("node:path");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const ai_module_1 = require("./ai/ai.module");
const config_1 = require("@nestjs/config");
const controller_service_1 = require("./controller/controller.service");
const speech_module_1 = require("./speech/speech.module");
const chat_memory_module_1 = require("./chat-memory/chat-memory.module");
const image_knowledge_module_1 = require("./image-knowledge/image-knowledge.module");
const serve_static_1 = require("@nestjs/serve-static");
const event_emitter_1 = require("@nestjs/event-emitter");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            ai_module_1.AiModule,
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
            }),
            event_emitter_1.EventEmitterModule.forRoot({
                maxListeners: 200,
            }),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, node_path_1.join)(process.cwd(), 'public')
            }),
            speech_module_1.SpeechModule,
            chat_memory_module_1.ChatMemoryModule,
            image_knowledge_module_1.ImageKnowledgeModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService, controller_service_1.ControllerService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
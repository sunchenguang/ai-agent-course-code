"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMemoryModule = void 0;
const common_1 = require("@nestjs/common");
const image_knowledge_module_1 = require("../image-knowledge/image-knowledge.module");
const chat_memory_service_1 = require("./chat-memory.service");
const chat_memory_controller_1 = require("./chat-memory.controller");
let ChatMemoryModule = class ChatMemoryModule {
};
exports.ChatMemoryModule = ChatMemoryModule;
exports.ChatMemoryModule = ChatMemoryModule = __decorate([
    (0, common_1.Module)({
        imports: [image_knowledge_module_1.ImageKnowledgeModule],
        controllers: [chat_memory_controller_1.ChatMemoryController],
        providers: [chat_memory_service_1.ChatMemoryService],
        exports: [chat_memory_service_1.ChatMemoryService],
    })
], ChatMemoryModule);
//# sourceMappingURL=chat-memory.module.js.map
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
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const openai_1 = require("@langchain/openai");
const prompts_1 = require("@langchain/core/prompts");
const output_parsers_1 = require("@langchain/core/output_parsers");
const messages_1 = require("@langchain/core/messages");
const langchain_1 = require("langchain");
const event_emitter_1 = require("@nestjs/event-emitter");
const langchain_2 = require("@ai-sdk/langchain");
const stream_events_1 = require("../common/stream-events");
const image_knowledge_service_1 = require("../image-knowledge/image-knowledge.service");
let AiService = class AiService {
    model;
    webSearchTool;
    eventEmitter;
    imageKnowledge;
    chain;
    agent;
    constructor(model, webSearchTool, eventEmitter, imageKnowledge) {
        this.model = model;
        this.webSearchTool = webSearchTool;
        this.eventEmitter = eventEmitter;
        this.imageKnowledge = imageKnowledge;
        const prompt = prompts_1.PromptTemplate.fromTemplate('请回答以下问题：\n\n{query}');
        this.chain = prompt.pipe(this.model).pipe(new output_parsers_1.StringOutputParser());
        this.agent = (0, langchain_1.createAgent)({
            model: this.model,
            tools: [this.webSearchTool],
            systemPrompt: '你是 AI 助手。需要最新信息、事实核查或联网信息时，请使用 web_search 工具搜索后再作答。',
        });
    }
    async streamSdkChat(messages, useImages = false) {
        let lcMessages = await (0, langchain_2.toBaseMessages)(messages);
        lcMessages = await this.applyImageContextToMessages(lcMessages, useImages);
        const lgStream = await this.agent.stream({ messages: lcMessages }, {
            streamMode: ['messages', 'values'],
            recursionLimit: 30,
        });
        return (0, langchain_2.toUIMessageStream)(lgStream);
    }
    getPlainTextFromHumanMessage(msg) {
        const c = msg.content;
        if (typeof c === 'string')
            return c;
        if (Array.isArray(c)) {
            return c
                .map((part) => {
                if (typeof part === 'string')
                    return part;
                if (part &&
                    typeof part === 'object' &&
                    'type' in part &&
                    part.type === 'text' &&
                    'text' in part) {
                    return String(part.text);
                }
                return '';
            })
                .join('');
        }
        return '';
    }
    async applyImageContextToMessages(messages, useImages) {
        if (!useImages || messages.length === 0)
            return messages;
        let lastHumanIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]._getType() === 'human') {
                lastHumanIdx = i;
                break;
            }
        }
        if (lastHumanIdx < 0)
            return messages;
        const hm = messages[lastHumanIdx];
        const query = this.getPlainTextFromHumanMessage(hm).trim();
        if (!query)
            return messages;
        let augmentedQuery = query;
        try {
            const hits = await this.imageKnowledge.searchForQuery(query, 5);
            if (hits.length > 0) {
                const block = this.imageKnowledge.formatHitsForPrompt(hits);
                augmentedQuery = `以下是与用户问题可能相关的图片说明（含可访问链接），请结合有用的信息回答；若与用户问题无关可忽略。\n\n${block}\n\n用户问题：\n${query}`;
            }
        }
        catch (err) {
            console.warn('image-knowledge 检索已跳过:', err instanceof Error ? err.message : err);
        }
        if (augmentedQuery === query)
            return messages;
        const next = messages.slice();
        next[lastHumanIdx] = new messages_1.HumanMessage(augmentedQuery);
        return next;
    }
    async *streamChain(query, ttsSessionId, useImages = false) {
        let augmentedQuery = query;
        if (useImages && query?.trim()) {
            try {
                const hits = await this.imageKnowledge.searchForQuery(query.trim(), 5);
                if (hits.length > 0) {
                    const block = this.imageKnowledge.formatHitsForPrompt(hits);
                    augmentedQuery = `以下是与用户问题可能相关的图片说明（含可访问链接），请结合有用的信息回答；若与用户问题无关可忽略。\n\n${block}\n\n用户问题：\n${query}`;
                }
            }
            catch (err) {
                console.warn('image-knowledge 检索已跳过:', err instanceof Error ? err.message : err);
            }
        }
        try {
            const stream = await this.chain.stream({ query: augmentedQuery });
            for await (const chunk of stream) {
                const text = typeof chunk === 'string' ? chunk : String(chunk);
                if (ttsSessionId) {
                    const event = {
                        type: 'chunk',
                        sessionId: ttsSessionId,
                        chunk: text,
                    };
                    this.eventEmitter.emit(stream_events_1.AI_TTS_STREAM_EVENT, event);
                }
                yield text;
            }
            if (ttsSessionId) {
                const endEvent = {
                    type: 'end',
                    sessionId: ttsSessionId,
                };
                this.eventEmitter.emit(stream_events_1.AI_TTS_STREAM_EVENT, endEvent);
            }
        }
        catch (error) {
            if (ttsSessionId) {
                const errorEvent = {
                    type: 'error',
                    sessionId: ttsSessionId,
                    error: error instanceof Error ? error.message : String(error),
                };
                this.eventEmitter.emit(stream_events_1.AI_TTS_STREAM_EVENT, errorEvent);
            }
            throw error;
        }
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('CHAT_MODEL')),
    __param(1, (0, common_1.Inject)('WEB_SEARCH_TOOL')),
    __metadata("design:paramtypes", [openai_1.ChatOpenAI, Object, event_emitter_1.EventEmitter2,
        image_knowledge_service_1.ImageKnowledgeService])
], AiService);
//# sourceMappingURL=ai.service.js.map
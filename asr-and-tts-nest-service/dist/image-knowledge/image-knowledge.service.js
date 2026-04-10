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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageKnowledgeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const milvus2_sdk_node_1 = require("@zilliz/milvus2-sdk-node");
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const exifr_1 = __importDefault(require("exifr"));
const COLLECTION_NAME = 'image_memory';
const VECTOR_DIM = 1024;
function isHttpUrl(s) {
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    }
    catch {
        return false;
    }
}
function formatMetadataSummary(meta) {
    if (!meta.hasExif) {
        return meta.note || '（该文件未包含可用 EXIF，例如截图、压缩剥离或格式不支持）';
    }
    const lines = [];
    if (meta.capturedAt)
        lines.push(`拍摄时间: ${meta.capturedAt}`);
    if (meta.latitude != null && meta.longitude != null) {
        lines.push(`GPS 坐标: ${meta.latitude.toFixed(6)}, ${meta.longitude.toFixed(6)}`);
    }
    if (meta.altitudeMeters != null)
        lines.push(`海拔约: ${meta.altitudeMeters} m`);
    if (meta.camera)
        lines.push(`相机: ${meta.camera}`);
    if (meta.lens)
        lines.push(`镜头: ${meta.lens}`);
    return lines.length ? lines.join('\n') : meta.note || '（EXIF 中无时间/坐标/相机等常用项）';
}
function buildSearchableText(title, description, tags, metaSummary) {
    const parts = [];
    if (title?.trim())
        parts.push(`标题: ${title.trim()}`);
    if (description.trim())
        parts.push(description.trim());
    if (tags?.trim())
        parts.push(`标签: ${tags.trim()}`);
    if (metaSummary?.trim())
        parts.push(`元数据:\n${metaSummary.trim()}`);
    return parts.join('\n') || description.trim();
}
function metaFromDbRow(row) {
    if (row.meta_has_exif !== 1) {
        return { hasExif: false, note: row.meta_note ?? undefined };
    }
    return {
        hasExif: true,
        capturedAt: row.meta_captured_at ?? undefined,
        latitude: row.meta_latitude ?? undefined,
        longitude: row.meta_longitude ?? undefined,
        altitudeMeters: row.meta_altitude ?? undefined,
        camera: row.meta_camera ?? undefined,
        lens: row.meta_lens ?? undefined,
        note: row.meta_note ?? undefined,
    };
}
function extractMessageText(message) {
    const c = message.content;
    if (typeof c === 'string')
        return c.trim();
    if (Array.isArray(c)) {
        return c
            .map((block) => {
            if (typeof block === 'string')
                return block;
            if (block && typeof block === 'object' && 'text' in block) {
                return String(block.text ?? '');
            }
            return '';
        })
            .join('')
            .trim();
    }
    return String(c ?? '').trim();
}
let ImageKnowledgeService = class ImageKnowledgeService {
    configService;
    client;
    embeddings;
    visionModel;
    db;
    minScore;
    constructor(configService) {
        this.configService = configService;
        this.client = new milvus2_sdk_node_1.MilvusClient({
            address: this.configService.get('MILVUS_ADDRESS') || 'localhost:19530',
        });
        this.embeddings = new openai_1.OpenAIEmbeddings({
            apiKey: this.configService.get('OPENAI_API_KEY'),
            model: this.configService.get('EMBEDDINGS_MODEL_NAME') || 'text-embedding-v3',
            configuration: {
                baseURL: this.configService.get('OPENAI_BASE_URL'),
            },
            dimensions: VECTOR_DIM,
        });
        const visionModelName = this.configService.get('VISION_MODEL_NAME') ||
            this.configService.get('MODEL_NAME') ||
            'gpt-4o-mini';
        this.visionModel = new openai_1.ChatOpenAI({
            model: visionModelName,
            apiKey: this.configService.get('OPENAI_API_KEY'),
            configuration: {
                baseURL: this.configService.get('OPENAI_BASE_URL'),
            },
            temperature: 0.3,
        });
        const dbPath = this.configService.get('SQLITE_PATH') || (0, node_path_1.join)(process.cwd(), 'data', 'image-knowledge.db');
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(dbPath), { recursive: true });
        this.db = new better_sqlite3_1.default(dbPath);
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS image_knowledge (
        id TEXT PRIMARY KEY,
        image_url TEXT NOT NULL,
        title TEXT,
        description TEXT NOT NULL,
        tags TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
        this.migrateImageKnowledgeColumns();
        const rawMin = this.configService.get('IMAGE_SEARCH_MIN_SCORE');
        this.minScore = rawMin !== undefined && rawMin !== '' ? parseFloat(rawMin) : 0.28;
    }
    async onModuleInit() {
        await this.initCollection();
    }
    migrateImageKnowledgeColumns() {
        const cols = this.db.prepare(`PRAGMA table_info(image_knowledge)`).all();
        const names = new Set(cols.map((c) => c.name));
        const add = (sql) => this.db.exec(sql);
        if (!names.has('meta_captured_at'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_captured_at TEXT;`);
        if (!names.has('meta_latitude'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_latitude REAL;`);
        if (!names.has('meta_longitude'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_longitude REAL;`);
        if (!names.has('meta_altitude'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_altitude REAL;`);
        if (!names.has('meta_camera'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_camera TEXT;`);
        if (!names.has('meta_lens'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_lens TEXT;`);
        if (!names.has('meta_has_exif'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_has_exif INTEGER;`);
        if (!names.has('meta_note'))
            add(`ALTER TABLE image_knowledge ADD COLUMN meta_note TEXT;`);
    }
    async fetchImageBytes(imageUrl) {
        const maxBytes = parseInt(this.configService.get('IMAGE_FETCH_MAX_BYTES') || String(20 * 1024 * 1024), 10);
        const timeoutMs = parseInt(this.configService.get('IMAGE_FETCH_TIMEOUT_MS') || '30000', 10);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(imageUrl, { signal: ctrl.signal, redirect: 'follow' });
            if (!res.ok) {
                throw new Error(`下载图片失败 HTTP ${res.status}`);
            }
            const cl = res.headers.get('content-length');
            if (cl && parseInt(cl, 10) > maxBytes) {
                throw new Error('图片体积超过限制');
            }
            const buf = await res.arrayBuffer();
            if (buf.byteLength > maxBytes) {
                throw new Error('图片体积超过限制');
            }
            return new Uint8Array(buf);
        }
        finally {
            clearTimeout(timer);
        }
    }
    async extractImageMetadata(imageUrl) {
        const empty = { hasExif: false };
        try {
            const bytes = await this.fetchImageBytes(imageUrl);
            const parsed = await exifr_1.default.parse(bytes, {
                tiff: true,
                exif: true,
                gps: true,
                reviveValues: true,
                mergeOutput: true,
            });
            if (!parsed || typeof parsed !== 'object') {
                return { ...empty, note: '未解析到 EXIF（截图、剥离元数据或不支持的容器）' };
            }
            const meta = { hasExif: false };
            const dt = parsed
                .DateTimeOriginal ??
                parsed.CreateDate ??
                parsed.ModifyDate;
            if (dt instanceof Date) {
                meta.capturedAt = dt.toISOString();
            }
            else if (typeof dt === 'string') {
                meta.capturedAt = dt;
            }
            const lat = parsed.latitude;
            const lng = parsed.longitude;
            if (typeof lat === 'number' && typeof lng === 'number') {
                meta.latitude = lat;
                meta.longitude = lng;
            }
            const alt = parsed.GPSAltitude;
            if (typeof alt === 'number') {
                meta.altitudeMeters = alt;
            }
            const make = String(parsed.Make || '').trim();
            const model = String(parsed.Model || '').trim();
            const cam = `${make} ${model}`.trim();
            if (cam)
                meta.camera = cam;
            const lens = parsed.LensModel;
            if (lens)
                meta.lens = String(lens);
            const ori = parsed.Orientation;
            if (typeof ori === 'number')
                meta.orientation = ori;
            const useful = !!(meta.capturedAt || (meta.latitude != null && meta.longitude != null) || meta.camera);
            if (useful) {
                meta.hasExif = true;
                return meta;
            }
            return {
                hasExif: false,
                note: '文件中无常用拍摄信息（时间/GPS/相机型号）',
            };
        }
        catch (e) {
            return {
                hasExif: false,
                note: `读取 EXIF 失败：${e.message}`,
            };
        }
    }
    async describeImageWithMeta(imageUrl, metadata) {
        const metaBlock = formatMetadataSummary(metadata);
        const response = await this.visionModel.invoke([
            new messages_1.HumanMessage({
                content: [
                    {
                        type: 'text',
                        text: `下面是从图片文件读取的 EXIF 元数据（若无有效项则说明未嵌入或已丢失）。请用 2～4 句中文说明：① 画面主要内容；② 若上方有时间或 GPS，请在句中明确写出「拍摄时间」「GPS 坐标」；③ 若画面能推断地点可写「画面推测地点」，勿与 EXIF 混为一谈。不要问候语。\n----\n${metaBlock}\n----`,
                    },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ],
            }),
        ]);
        const text = extractMessageText(response);
        if (!text) {
            throw new Error('视觉模型未返回有效描述');
        }
        return text;
    }
    async analyzeImageUrl(imageUrl) {
        const metadata = await this.extractImageMetadata(imageUrl);
        const description = await this.describeImageWithMeta(imageUrl, metadata);
        return { description, metadata };
    }
    async extractTextFromImageBuffer(buffer, mimetype) {
        const maxBytes = parseInt(this.configService.get('IMAGE_FETCH_MAX_BYTES') || String(20 * 1024 * 1024), 10);
        if (!buffer?.length) {
            throw new Error('图片为空');
        }
        if (buffer.length > maxBytes) {
            throw new Error(`图片超过限制（最大 ${Math.round(maxBytes / (1024 * 1024))}MB）`);
        }
        const mt = (mimetype || 'image/png').toLowerCase();
        if (!mt.startsWith('image/')) {
            throw new Error('请上传图片文件');
        }
        const dataUrl = `data:${mt};base64,${buffer.toString('base64')}`;
        const response = await this.visionModel.invoke([
            new messages_1.HumanMessage({
                content: [
                    {
                        type: 'text',
                        text: '你是 OCR 助手。请完整识别图片中的所有文字，按视觉阅读顺序输出。尽量保留换行以反映聊天界面或段落结构。不要添加任何解释、摘要或问候语。若图片中没有任何可读文字，只输出一行：【图中无文字】',
                    },
                    { type: 'image_url', image_url: { url: dataUrl } },
                ],
            }),
        ]);
        const text = extractMessageText(response);
        if (!text) {
            throw new Error('视觉模型未返回文字');
        }
        return text.trim();
    }
    async initCollection() {
        try {
            await this.client.connectPromise;
            const hasCollection = await this.client.hasCollection({
                collection_name: COLLECTION_NAME,
            });
            if (!hasCollection.value) {
                await this.client.createCollection({
                    collection_name: COLLECTION_NAME,
                    fields: [
                        { name: 'id', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 64, is_primary_key: true },
                        { name: 'vector', data_type: milvus2_sdk_node_1.DataType.FloatVector, dim: VECTOR_DIM },
                        { name: 'content', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 5000 },
                        { name: 'image_url', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 2048 },
                        { name: 'title', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 512 },
                        { name: 'created_at', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 50 },
                    ],
                });
                await this.client.createIndex({
                    collection_name: COLLECTION_NAME,
                    field_name: 'vector',
                    index_type: milvus2_sdk_node_1.IndexType.IVF_FLAT,
                    metric_type: milvus2_sdk_node_1.MetricType.COSINE,
                    params: { nlist: 128 },
                });
            }
            await this.client.loadCollection({ collection_name: COLLECTION_NAME });
        }
        catch (error) {
            console.error('ImageKnowledge Milvus init error:', error.message);
        }
    }
    async embed(text) {
        return this.embeddings.embedQuery(text);
    }
    async generateDescriptionFromImageUrl(imageUrl) {
        const { description } = await this.analyzeImageUrl(imageUrl);
        return description;
    }
    rowToRecord(row) {
        return {
            id: row.id,
            imageUrl: row.image_url,
            title: row.title,
            description: row.description,
            tags: row.tags,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            metadata: metaFromDbRow(row),
        };
    }
    async createFromOssUrl(params) {
        const { imageUrl } = params;
        if (!imageUrl?.trim()) {
            throw new Error('imageUrl 不能为空');
        }
        if (!isHttpUrl(imageUrl.trim())) {
            throw new Error('imageUrl 须为 http(s) 链接');
        }
        const url = imageUrl.trim();
        const title = params.title?.trim() || null;
        const tags = params.tags?.trim() || null;
        const metadata = await this.extractImageMetadata(url);
        const description = params.description?.trim() || (await this.describeImageWithMeta(url, metadata));
        const id = (0, node_crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const metaSummary = formatMetadataSummary(metadata);
        const searchable = buildSearchableText(title, description, tags, metaSummary);
        this.db
            .prepare(`INSERT INTO image_knowledge (
          id, image_url, title, description, tags, created_at, updated_at,
          meta_captured_at, meta_latitude, meta_longitude, meta_altitude, meta_camera, meta_lens, meta_has_exif, meta_note
        ) VALUES (
          @id, @image_url, @title, @description, @tags, @created_at, @updated_at,
          @meta_captured_at, @meta_latitude, @meta_longitude, @meta_altitude, @meta_camera, @meta_lens, @meta_has_exif, @meta_note
        )`)
            .run({
            id,
            image_url: url,
            title,
            description,
            tags,
            created_at: now,
            updated_at: now,
            meta_captured_at: metadata.capturedAt ?? null,
            meta_latitude: metadata.latitude ?? null,
            meta_longitude: metadata.longitude ?? null,
            meta_altitude: metadata.altitudeMeters ?? null,
            meta_camera: metadata.camera ?? null,
            meta_lens: metadata.lens ?? null,
            meta_has_exif: metadata.hasExif ? 1 : 0,
            meta_note: metadata.note ?? null,
        });
        await this.insertMilvus(id, searchable, url, title ?? '', now);
        return this.getByIdOrThrow(id);
    }
    async insertMilvus(id, content, imageUrl, title, createdAt) {
        const vector = await this.embed(content);
        await this.client.insert({
            collection_name: COLLECTION_NAME,
            data: [
                {
                    id,
                    vector,
                    content: content.slice(0, 5000),
                    image_url: imageUrl.slice(0, 2048),
                    title: title.slice(0, 512),
                    created_at: createdAt,
                },
            ],
        });
    }
    async deleteMilvusById(id) {
        await this.client.delete({
            collection_name: COLLECTION_NAME,
            filter: `id == "${id}"`,
        });
    }
    async updateRecord(id, patch) {
        const row = this.db.prepare(`SELECT * FROM image_knowledge WHERE id = ?`).get(id);
        if (!row) {
            throw new Error('记录不存在');
        }
        const title = patch.title !== undefined ? (patch.title.trim() || null) : row.title;
        const description = patch.description !== undefined ? patch.description.trim() : row.description;
        const tags = patch.tags !== undefined ? (patch.tags.trim() || null) : row.tags;
        if (!description) {
            throw new Error('description 不能为空');
        }
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE image_knowledge SET title = @title, description = @description, tags = @tags, updated_at = @updated_at
         WHERE id = @id`)
            .run({
            id,
            title,
            description,
            tags,
            updated_at: now,
        });
        const keptMeta = metaFromDbRow(row);
        const searchable = buildSearchableText(title, description, tags, formatMetadataSummary(keptMeta));
        await this.deleteMilvusById(id);
        await this.insertMilvus(id, searchable, row.image_url, title ?? '', row.created_at);
        return this.getByIdOrThrow(id);
    }
    async deleteRecord(id) {
        const row = this.db.prepare(`SELECT id FROM image_knowledge WHERE id = ?`).get(id);
        if (!row)
            return false;
        this.db.prepare(`DELETE FROM image_knowledge WHERE id = ?`).run(id);
        try {
            await this.deleteMilvusById(id);
        }
        catch {
        }
        return true;
    }
    getByIdOrThrow(id) {
        const row = this.db.prepare(`SELECT * FROM image_knowledge WHERE id = ?`).get(id);
        if (!row)
            throw new Error('记录不存在');
        return this.rowToRecord(row);
    }
    listAll() {
        const rows = this.db
            .prepare(`SELECT * FROM image_knowledge ORDER BY datetime(created_at) DESC`)
            .all();
        return rows.map((r) => this.rowToRecord(r));
    }
    async searchForQuery(query, limit = 5) {
        if (!query?.trim())
            return [];
        const qv = await this.embed(query.trim());
        const searchResult = await this.client.search({
            collection_name: COLLECTION_NAME,
            vector: qv,
            limit,
            metric_type: milvus2_sdk_node_1.MetricType.COSINE,
            output_fields: ['id', 'content', 'image_url', 'title'],
        });
        const results = searchResult.results ?? [];
        return results
            .filter((r) => (r.score ?? 0) >= this.minScore)
            .map((r) => ({
            id: String(r.id ?? ''),
            score: r.score ?? 0,
            content: String(r.content ?? ''),
            imageUrl: String(r.image_url ?? ''),
            title: String(r.title ?? ''),
        }));
    }
    formatHitsForPrompt(hits) {
        return hits
            .map((h, i) => {
            const titleLine = h.title ? `标题: ${h.title}\n` : '';
            return `[参考图 ${i + 1}] 相关度: ${h.score.toFixed(4)}\n${titleLine}链接: ${h.imageUrl}\n说明: ${h.content}`;
        })
            .join('\n\n---\n\n');
    }
};
exports.ImageKnowledgeService = ImageKnowledgeService;
exports.ImageKnowledgeService = ImageKnowledgeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ImageKnowledgeService);
//# sourceMappingURL=image-knowledge.service.js.map
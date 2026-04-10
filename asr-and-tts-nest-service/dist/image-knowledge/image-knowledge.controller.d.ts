import { ImageKnowledgeService } from './image-knowledge.service';
export declare class ImageKnowledgeController {
    private readonly imageKnowledgeService;
    constructor(imageKnowledgeService: ImageKnowledgeService);
    ocrChatImage(file?: {
        buffer: Buffer;
        mimetype: string;
        size: number;
    }): Promise<{
        success: boolean;
        message: string;
        text?: undefined;
    } | {
        success: boolean;
        text: string;
        message?: undefined;
    }>;
    previewDescription(imageUrl: string): Promise<{
        success: boolean;
        message: string;
        description?: undefined;
        metadata?: undefined;
    } | {
        success: boolean;
        description: string;
        metadata: import("./image-knowledge.service").ImageExifMeta;
        message?: undefined;
    }>;
    create(imageUrl: string, title?: string, tags?: string, description?: string): Promise<{
        success: boolean;
        message: string;
        record?: undefined;
    } | {
        success: boolean;
        record: import("./image-knowledge.service").ImageKnowledgeRecord;
        message?: undefined;
    }>;
    list(): {
        success: boolean;
        records: import("./image-knowledge.service").ImageKnowledgeRecord[];
    };
    searchByQuery(q: string, limit?: string): Promise<{
        success: boolean;
        message: string;
        results?: undefined;
    } | {
        success: boolean;
        results: import("./image-knowledge.service").ImageSearchHit[];
        message?: undefined;
    }>;
    getOne(id: string): {
        success: boolean;
        record: import("./image-knowledge.service").ImageKnowledgeRecord;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        record?: undefined;
    };
    update(id: string, title?: string, description?: string, tags?: string): Promise<{
        success: boolean;
        record: import("./image-knowledge.service").ImageKnowledgeRecord;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        record?: undefined;
    }>;
    remove(id: string): Promise<{
        success: boolean;
        deleted: boolean;
    }>;
}

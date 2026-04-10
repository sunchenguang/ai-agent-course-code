import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface ImageExifMeta {
    hasExif: boolean;
    capturedAt?: string;
    latitude?: number;
    longitude?: number;
    altitudeMeters?: number;
    camera?: string;
    lens?: string;
    orientation?: number;
    note?: string;
}
export interface ImageKnowledgeRecord {
    id: string;
    imageUrl: string;
    title: string | null;
    description: string;
    tags: string | null;
    createdAt: string;
    updatedAt: string;
    metadata: ImageExifMeta;
}
export interface ImageSearchHit {
    id: string;
    score: number;
    content: string;
    imageUrl: string;
    title: string;
}
export declare class ImageKnowledgeService implements OnModuleInit {
    private readonly configService;
    private client;
    private embeddings;
    private visionModel;
    private db;
    private readonly minScore;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    private migrateImageKnowledgeColumns;
    private fetchImageBytes;
    extractImageMetadata(imageUrl: string): Promise<ImageExifMeta>;
    private describeImageWithMeta;
    analyzeImageUrl(imageUrl: string): Promise<{
        description: string;
        metadata: ImageExifMeta;
    }>;
    extractTextFromImageBuffer(buffer: Buffer, mimetype: string): Promise<string>;
    private initCollection;
    private embed;
    generateDescriptionFromImageUrl(imageUrl: string): Promise<string>;
    private rowToRecord;
    createFromOssUrl(params: {
        imageUrl: string;
        title?: string;
        tags?: string;
        description?: string;
    }): Promise<ImageKnowledgeRecord>;
    private insertMilvus;
    private deleteMilvusById;
    updateRecord(id: string, patch: {
        title?: string;
        description?: string;
        tags?: string;
    }): Promise<ImageKnowledgeRecord>;
    deleteRecord(id: string): Promise<boolean>;
    getByIdOrThrow(id: string): ImageKnowledgeRecord;
    listAll(): ImageKnowledgeRecord[];
    searchForQuery(query: string, limit?: number): Promise<ImageSearchHit[]>;
    formatHitsForPrompt(hits: ImageSearchHit[]): string;
}

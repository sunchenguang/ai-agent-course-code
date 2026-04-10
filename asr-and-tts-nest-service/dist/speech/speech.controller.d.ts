import { SpeechService } from './speech.service';
export declare class SpeechController {
    private readonly speechService;
    constructor(speechService: SpeechService);
    recognize(file?: {
        buffer: Buffer;
        originalname: string;
        mimetype: string;
        size: number;
    }): Promise<{
        text: string;
    }>;
}

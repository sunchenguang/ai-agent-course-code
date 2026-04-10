import type * as tencentcloud from 'tencentcloud-sdk-nodejs';
type UploadedAudio = {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
};
type AsrClient = InstanceType<typeof tencentcloud.asr.v20190614.Client>;
export declare class SpeechService {
    private readonly asrClient;
    constructor(asrClient: AsrClient);
    recognizeBySentence(file: UploadedAudio): Promise<string>;
}
export {};

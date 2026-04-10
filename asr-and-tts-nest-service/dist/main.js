"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const ws_1 = require("ws");
const tts_relay_service_1 = require("./speech/tts-relay.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: '*',
        credentials: true,
    });
    const ttsRelayService = app.get(tts_relay_service_1.TtsRelayService);
    const server = app.getHttpServer();
    const ttsWss = new ws_1.WebSocketServer({
        server,
        path: '/speech/tts/ws',
    });
    ttsWss.on('connection', (socket, request) => {
        const reqUrl = new URL(request.url ?? '', 'http://localhost');
        const wantedSessionId = reqUrl.searchParams.get('sessionId') ?? undefined;
        const sessionId = ttsRelayService.registerClient(socket, wantedSessionId);
        socket.on('close', () => {
            ttsRelayService.unregisterClient(sessionId);
        });
    });
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
//# sourceMappingURL=main.js.map
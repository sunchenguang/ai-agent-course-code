import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: 5177,
    proxy: {
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on("error", (error, _req, res) => {
            if (res.writeHead && !res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "后端连接中断，请确认服务已启动后重试。",
                  detail: error.message,
                }),
              );
              return;
            }
            if (res.end && !res.writableEnded) {
              res.end();
            }
          });
        },
      },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});

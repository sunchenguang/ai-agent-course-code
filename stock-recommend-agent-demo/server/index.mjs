import "dotenv/config";

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAgentStream } from "./agent/stream-events.mjs";
import {
  ensureSessionWorkspace,
  resetSessionWorkspace,
} from "./agent/session-workspace.mjs";
import { recommendationGraph } from "./graph.mjs";
import { runRecommendationStream } from "./recommendation-stream.mjs";
import { writeSseEvent } from "./utils/streaming-response.mjs";

const app = express();
const port = Number(process.env.PORT ?? 3333);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/recommend", async (req, res) => {
  try {
    const result = await recommendationGraph.invoke({
      tickers: req.body.tickers,
      tickerText: req.body.tickerText,
      theme: req.body.theme,
    });

    res.json({
      tickers: result.tickers,
      theme: result.theme,
      ranking: result.ranking,
      reportMarkdown: result.reportMarkdown,
      errors: result.errors,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/agent/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const sessionId = String(req.body.sessionId ?? "").trim();
  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
  const resetWorkspace = Boolean(req.body.resetWorkspace);

  if (!sessionId) {
    writeSseEvent(res, "error", { error: "缺少 sessionId" });
    res.end();
    return;
  }

  if (!messages.length) {
    writeSseEvent(res, "error", { error: "messages 不能为空" });
    res.end();
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    writeSseEvent(res, "error", {
      error: "未配置 OPENAI_API_KEY，Agent 模式不可用。请配置后重试，或使用经典流水线模式。",
    });
    res.end();
    return;
  }

  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
  });

  const send = (event, payload) => {
    if (clientClosed || res.writableEnded || res.destroyed) return;
    try {
      writeSseEvent(res, event, payload);
    } catch {
      clientClosed = true;
    }
  };

  try {
    await runAgentStream(
      { sessionId, messages, resetWorkspace },
      {
        send,
        resetSessionWorkspace,
        ensureSessionWorkspace,
      },
    );
  } catch (error) {
    if (!clientClosed && !res.writableEnded) {
      send("error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.post("/api/recommend/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    await runRecommendationStream(req.body, {
      send: (event, payload) => writeSseEvent(res, event, payload),
    });
  } catch (error) {
    writeSseEvent(res, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    res.end();
  }
});

const distDir = path.join(projectRoot, "dist");
app.use(express.static(distDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Stock recommendation agent API listening on http://localhost:${port}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

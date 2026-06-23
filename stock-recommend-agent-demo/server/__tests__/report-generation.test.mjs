import assert from "node:assert/strict";
import test from "node:test";

import { streamReportMarkdown } from "../utils/report-generation.mjs";

const baseState = {
  theme: "AI 芯片股",
  ranking: [
    {
      ticker: "NVDA",
      name: "NVIDIA Corporation",
      score: 88,
      rating: "强烈关注",
      factors: {
        momentum: 90,
        fundamentals: 80,
        sentiment: 85,
        riskControl: 70,
      },
      sentiment: {
        label: "bullish",
        reason: "新闻信号偏正面。",
      },
      riskFlags: [],
      stockData: {
        regularMarketPrice: 120,
        currency: "USD",
        regularMarketChangePercent: 1.2,
      },
      news: { items: [] },
    },
  ],
  errors: [],
};

test("streams fallback markdown when no model is available", async () => {
  const chunks = [];

  for await (const chunk of streamReportMarkdown(baseState, { model: null })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.length > 1);
  assert.match(chunks.join(""), /# AI 芯片股：AI 股票推荐研报/);
  assert.match(chunks.join(""), /仅用于技术演示，不构成.*投资建议/);
});

test("streams model chunks and ignores empty deltas", async () => {
  const model = {
    async *stream() {
      yield { content: "第一段" };
      yield { content: "" };
      yield { content: [{ text: "第二段" }] };
    },
  };

  const chunks = [];
  for await (const chunk of streamReportMarkdown(baseState, { model })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ["第一段", "第二段"]);
});

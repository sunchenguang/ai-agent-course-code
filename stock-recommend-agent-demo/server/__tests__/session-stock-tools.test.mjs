import assert from "node:assert/strict";
import test from "node:test";

import { buildFindingsMarkdown } from "../agent/batch-research.mjs";
import { readSessionFile, resetSessionStore, writeSessionFile } from "../agent/session-memory.mjs";
import { createSaveFindingsTool } from "../agent/session-stock-tools.mjs";

test("save_stock_findings writes findings markdown with sentiment", async () => {
  const sessionId = "test-save-findings";
  resetSessionStore(sessionId);
  writeSessionFile(
    sessionId,
    "sources/market_data_NVDA.json",
    JSON.stringify({ ticker: "NVDA", shortName: "NVIDIA" }),
  );
  writeSessionFile(
    sessionId,
    "sources/news_NVDA.json",
    JSON.stringify({
      items: [
        {
          title: "AI boom",
          url: "https://example.com",
          summary: "test",
          siteName: "News",
          publishedAt: "2026-01-01",
        },
      ],
    }),
  );

  const tool = createSaveFindingsTool(sessionId);
  const result = await tool.invoke({
    ticker: "NVDA",
    sentiment: { label: "bullish", confidence: 0.8, reason: "AI 需求强劲" },
  });

  assert.match(String(result), /已保存 NVDA/);
  const findings = readSessionFile(sessionId, "sources/findings_NVDA.md");
  assert.match(findings, /bullish/);
  assert.match(findings, /AI boom/);
});

test("buildFindingsMarkdown is exported for session tools", () => {
  const md = buildFindingsMarkdown({
    ticker: "AMD",
    name: "AMD",
    news: { items: [] },
    sentiment: { label: "neutral", confidence: 0.5, reason: "观望" },
  });
  assert.match(md, /neutral/);
});

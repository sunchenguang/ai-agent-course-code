import assert from "node:assert/strict";
import test from "node:test";

import { buildFindingsMarkdown } from "../agent/batch-research.mjs";
import { readSessionFile, resetSessionStore, writeSessionFile } from "../agent/session-memory.mjs";
import { readSessionMarketData } from "../agent/session-market-data.mjs";
import {
  createSaveFindingsTool,
  createSessionFetchQuoteTool,
  searchNewsInputSchema,
} from "../agent/session-stock-tools.mjs";
import { writeResearchTargets } from "../agent/research-targets.mjs";

test("searchNewsInputSchema accepts companyName without ticker", () => {
  const parsed = searchNewsInputSchema.parse({
    companyName: "盛新锂能",
    theme: "锂资源布局",
  });
  assert.equal(parsed.companyName, "盛新锂能");
  assert.equal(parsed.ticker, undefined);
});

test("searchNewsInputSchema rejects empty input", () => {
  assert.throws(() => searchNewsInputSchema.parse({ theme: "AI" }));
});

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

test("save_stock_findings auto-matches single session market data when ticker mismatches", async () => {
  const sessionId = "test-save-findings-automatch";
  resetSessionStore(sessionId);
  writeSessionFile(
    sessionId,
    "sources/market_data_600519.json",
    JSON.stringify({ ticker: "600519", shortName: "贵州茅台", sessionTicker: "600519" }),
  );
  writeSessionFile(sessionId, "sources/news_600519.json", JSON.stringify({ items: [] }));

  const tool = createSaveFindingsTool(sessionId);
  const result = await tool.invoke({
    ticker: "SPCX",
    sentiment: { label: "neutral", confidence: 0.6, reason: "测试" },
  });

  assert.match(String(result), /已保存 600519/);
  assert.match(String(result), /自动匹配/);
  const findings = readSessionFile(sessionId, "sources/findings_600519.md");
  assert.match(findings, /neutral/);
});

test("save_stock_findings resolves ticker via research targets when session key mismatches", async () => {
  const sessionId = "test-save-findings-target-lookup";
  resetSessionStore(sessionId);
  writeResearchTargets(sessionId, {
    tickers: ["002240"],
    details: [{ ticker: "002240", name: "盛新锂能", companyName: "盛新锂能" }],
  });
  writeSessionFile(
    sessionId,
    "sources/market_data_002240.json",
    JSON.stringify({ ticker: "002240", shortName: "盛新锂能", sessionTicker: "002240" }),
  );
  writeSessionFile(sessionId, "sources/news_002240.json", JSON.stringify({ items: [] }));

  const tool = createSaveFindingsTool(sessionId);
  const result = await tool.invoke({
    ticker: "002240.SZ",
    sentiment: { label: "neutral", confidence: 0.6, reason: "锂价波动" },
  });

  assert.match(String(result), /已保存 002240/);
});

test("fetch_stock_quote rejects out-of-scope resolved ticker when research targets exist", async () => {
  const sessionId = "test-fetch-quote-scope";
  resetSessionStore(sessionId);
  writeResearchTargets(sessionId, {
    tickers: ["002240"],
    details: [{ ticker: "002240", name: "盛新锂能", companyName: "盛新锂能" }],
  });

  const tool = createSessionFetchQuoteTool(sessionId);
  await assert.rejects(
    () => tool.invoke({ ticker: "SPCX" }),
    /不在本轮调研范围/,
  );
});

test("fetch_stock_quote maps Chinese company name to research target ticker", async () => {
  const sessionId = "test-fetch-quote-target-name";
  resetSessionStore(sessionId);
  writeResearchTargets(sessionId, {
    tickers: ["002240"],
    details: [{ ticker: "002240", name: "盛新锂能", companyName: "盛新锂能" }],
  });

  const tool = createSessionFetchQuoteTool(sessionId);
  const raw = await tool.invoke({ ticker: "盛新锂能" });
  const payload = JSON.parse(String(raw));
  assert.equal(payload.sessionTicker, "002240");
  assert.equal(payload.ticker, "002240");
});

test("readSessionMarketData resolves exchange suffix aliases", () => {
  const sessionId = "test-read-market-data";
  resetSessionStore(sessionId);
  writeSessionFile(
    sessionId,
    "sources/market_data_600519.json",
    JSON.stringify({ ticker: "600519", shortName: "贵州茅台" }),
  );

  const match = readSessionMarketData(sessionId, "600519.SS");
  assert.equal(match.storageKey, "600519");
  assert.equal(match.stockData.shortName, "贵州茅台");
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

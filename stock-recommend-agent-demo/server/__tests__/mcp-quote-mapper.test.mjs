import assert from "node:assert/strict";
import test from "node:test";

import {
  mapMcpQuoteToSnapshot,
  parseMcpQuotePayload,
  selectBestMcpQuote,
} from "../mcp/stock-sdk-quote.mjs";

test("mapMcpQuoteToSnapshot maps A-share fields", () => {
  const snapshot = mapMcpQuoteToSnapshot(
    {
      market: "A-Share",
      name: "贵州茅台",
      code: "600519",
      price: 1214.75,
      prevClose: 1222.45,
      changePercent: -0.63,
      pe: 18.36,
      totalMarketCap: 15185.37,
      low52w: 1205,
      high52w: 1568,
    },
    "600519",
  );

  assert.equal(snapshot.ticker, "600519.SS");
  assert.equal(snapshot.shortName, "贵州茅台");
  assert.equal(snapshot.currency, "CNY");
  assert.equal(snapshot.regularMarketPrice, 1214.75);
  assert.equal(snapshot.trailingPE, 18.36);
  assert.equal(snapshot.marketCap, 15185.37 * 1e8);
  assert.equal(snapshot.fiftyTwoWeekLow, 1205);
  assert.equal(snapshot.source, "MCP/stock-sdk-mcp");
});

test("mapMcpQuoteToSnapshot maps US stock fields", () => {
  const snapshot = mapMcpQuoteToSnapshot(
    {
      market: "US",
      name: "NVIDIA",
      code: "NVDA.OQ",
      price: 200.04,
      changePercent: -4.13,
      pe: 30.63,
      totalMarketCap: 48451.6884,
      low52w: 145.28,
      high52w: 236.26,
      raw: ["USD"],
    },
    "NVDA",
  );

  assert.equal(snapshot.ticker, "NVDA");
  assert.equal(snapshot.regularMarketPrice, 200.04);
  assert.equal(snapshot.trailingPE, 30.63);
  assert.equal(snapshot.fiftyTwoWeekHigh, 236.26);
});

test("selectBestMcpQuote prefers matching ticker", () => {
  const results = [
    { code: "600519", name: "贵州茅台" },
    { code: "000001", name: "平安银行" },
  ];
  const best = selectBestMcpQuote(results, "600519.SS");
  assert.equal(best.code, "600519");
});

test("parseMcpQuotePayload reads results array", () => {
  const payload = parseMcpQuotePayload('{"count":1,"results":[{"code":"NVDA"}]}');
  assert.equal(payload.length, 1);
  assert.equal(payload[0].code, "NVDA");
});

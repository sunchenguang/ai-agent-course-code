import test from "node:test";
import assert from "node:assert/strict";

import { scoreCandidates } from "./scoring.mjs";

test("scores and ranks candidates using market, sentiment, and risk signals", () => {
  const ranking = scoreCandidates([
    {
      ticker: "AAA",
      stockData: {
        regularMarketChangePercent: 5,
        fiftyTwoWeekLow: 50,
        fiftyTwoWeekHigh: 100,
        regularMarketPrice: 95,
        trailingPE: 38,
      },
      sentiment: { label: "bullish", confidence: 0.8 },
      riskFlags: ["估值偏高"],
    },
    {
      ticker: "BBB",
      stockData: {
        regularMarketChangePercent: -3,
        fiftyTwoWeekLow: 20,
        fiftyTwoWeekHigh: 100,
        regularMarketPrice: 35,
        trailingPE: 16,
      },
      sentiment: { label: "bearish", confidence: 0.7 },
      riskFlags: ["新闻情绪偏负"],
    },
  ]);

  assert.equal(ranking[0].ticker, "AAA");
  assert.equal(ranking[0].rating, "强烈关注");
  assert.equal(ranking[1].ticker, "BBB");
  assert.ok(ranking[0].score > ranking[1].score);
});

test("penalizes candidates with missing market data", () => {
  const [candidate] = scoreCandidates([
    {
      ticker: "MISSING",
      stockData: {},
      sentiment: { label: "neutral", confidence: 0.5 },
      riskFlags: [],
    },
  ]);

  assert.equal(candidate.rating, "暂不推荐");
  assert.ok(candidate.score < 50);
  assert.ok(candidate.riskFlags.includes("行情数据不完整"));
});

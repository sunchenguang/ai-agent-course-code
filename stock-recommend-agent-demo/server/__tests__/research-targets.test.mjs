import assert from "node:assert/strict";
import test from "node:test";

import { computeRankingFromSessionMemory } from "../agent/ranking-from-workspace.mjs";
import {
  filterTickersToResearchTargets,
  lookupResearchTarget,
  normalizeResearchTargetList,
  writeResearchTargets,
} from "../agent/research-targets.mjs";
import { resetSessionStore, writeSessionFile } from "../agent/session-memory.mjs";

test("normalizeResearchTargetList deduplicates exchange suffix variants", () => {
  assert.deepEqual(normalizeResearchTargetList(["600519.SS", "600519"]), ["600519"]);
});

test("filterTickersToResearchTargets drops out-of-scope tickers", () => {
  const filtered = filterTickersToResearchTargets(["600519", "APP", "SPCX"], ["600519"]);
  assert.deepEqual(filtered, ["600519"]);
});

test("lookupResearchTarget matches ticker code and Chinese company name", () => {
  const sessionId = "lookup-target-test";
  resetSessionStore(sessionId);
  writeResearchTargets(sessionId, {
    tickers: ["002240", "688352"],
    query: "锂板块",
    details: [
      { ticker: "002240", name: "盛新锂能", companyName: "盛新锂能" },
      { ticker: "688352", name: "顾中科技", companyName: "顾中科技" },
    ],
  });

  assert.equal(lookupResearchTarget(sessionId, "002240")?.ticker, "002240");
  assert.equal(lookupResearchTarget(sessionId, "002240.SZ")?.ticker, "002240");
  assert.equal(lookupResearchTarget(sessionId, "盛新锂能")?.ticker, "002240");
  assert.equal(lookupResearchTarget(sessionId, "调研盛新锂能")?.ticker, "002240");
  assert.equal(lookupResearchTarget(sessionId, "SPCX"), null);
});

test("computeRankingFromSessionMemory only ranks research targets", () => {
  const sessionId = "ranking-scope-test";
  resetSessionStore(sessionId);
  writeResearchTargets(sessionId, { tickers: ["600519"], query: "调研贵州茅台" });

  for (const ticker of ["600519", "APP", "SPCX"]) {
    writeSessionFile(
      sessionId,
      `sources/market_data_${ticker}.json`,
      JSON.stringify({
        ticker,
        shortName: ticker,
        regularMarketPrice: 100,
        regularMarketChangePercent: 1,
        trailingPE: 20,
      }),
    );
    writeSessionFile(
      sessionId,
      `sources/findings_${ticker}.md`,
      '```json\n{"label":"neutral","confidence":0.5,"reason":"测试"}\n```\n',
    );
  }

  const ranking = computeRankingFromSessionMemory(sessionId, { theme: "白酒" });
  assert.equal(ranking.ranking.length, 1);
  assert.equal(ranking.ranking[0].ticker, "600519");
});

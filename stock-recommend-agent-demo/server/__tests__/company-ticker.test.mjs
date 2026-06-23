import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCompanyNameCandidates,
  extractTickersFromText,
  formatResearchTargetHint,
  normalizeCompanyOrTicker,
  rankTickerCandidatesFromText,
} from "../utils/company-ticker.mjs";

test("normalizeCompanyOrTicker only accepts explicit ticker symbols", () => {
  assert.equal(normalizeCompanyOrTicker("SPCX"), "SPCX");
  assert.equal(normalizeCompanyOrTicker("nvda"), "NVDA");
  assert.equal(normalizeCompanyOrTicker("SpaceX"), null);
  assert.equal(normalizeCompanyOrTicker("space x"), null);
});

test("extractTickersFromText only finds explicit uppercase tickers", () => {
  assert.deepEqual(extractTickersFromText("调研spaceX"), []);
  assert.deepEqual(extractTickersFromText("对比 NVDA 和 SpaceX"), ["NVDA"]);
});

test("extractCompanyNameCandidates finds company names without tickers", () => {
  assert.deepEqual(extractCompanyNameCandidates("调研 Stripe"), ["Stripe"]);
  assert.deepEqual(extractCompanyNameCandidates("调研spaceX"), ["spaceX"]);
  assert.deepEqual(extractCompanyNameCandidates("研究 SpaceX 和 NVDA", ["NVDA"]), ["SpaceX"]);
  assert.deepEqual(extractCompanyNameCandidates("调研贵州茅台"), ["贵州茅台"]);
  assert.deepEqual(extractCompanyNameCandidates("贵州茅台"), ["贵州茅台"]);
});

test("rankTickerCandidatesFromText extracts A-share codes from Chinese text", () => {
  const ranked = rankTickerCandidatesFromText("贵州茅台股票代码：600519，上交所上市。", "贵州茅台");
  assert.equal(ranked[0]?.ticker, "600519.SS");
  assert.ok(ranked[0].score >= 3);
});

test("extractTickersFromText finds domestic tickers", () => {
  assert.deepEqual(extractTickersFromText("对比 600519 和 NVDA").sort(), ["600519.SS", "NVDA"].sort());
  assert.deepEqual(extractTickersFromText("0700.HK"), ["0700.HK"]);
});

test("rankTickerCandidatesFromText prefers exchange-qualified symbols", () => {
  const ranked = rankTickerCandidatesFromText(
    'SpaceX began trading on Nasdaq under the ticker symbol "SPCX" at $135.',
    "SpaceX",
  );
  assert.equal(ranked[0]?.ticker, "SPCX");
  assert.ok(ranked[0].score >= 3);
});

test("formatResearchTargetHint includes resolved and unresolved entries", () => {
  const hint = formatResearchTargetHint({
    tickers: ["SPCX"],
    details: [
      {
        query: "SpaceX",
        ticker: "SPCX",
        companyName: "Space Exploration Technologies Corp.",
        source: "bocha+yahoo",
      },
      {
        query: "MysteryCo",
        ticker: null,
        warning: "未能验证有效上市股票代码",
      },
    ],
  });
  assert.match(hint, /SPCX/);
  assert.match(hint, /MysteryCo/);
  assert.match(hint, /禁止/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { resolveTickerViaLlm } from "../utils/llm-ticker-resolve.mjs";
import { resolveCompanyTicker, resolveResearchTargetsFromText } from "../utils/resolve-company-ticker.mjs";

const mockMoutaiLlm = async () => ({
  ticker: "600519.SS",
  companyName: "贵州茅台",
  market: "cn-a",
  confidence: "high",
  source: "llm",
});

const mockMoutaiQuote = async (ticker) =>
  ticker === "600519.SS"
    ? {
        ticker: "600519.SS",
        shortName: "贵州茅台",
        regularMarketPrice: 1223,
        source: "东方财富",
      }
    : { error: "not found" };

test("resolveTickerViaLlm parses domestic ticker from model JSON", async () => {
  const result = await resolveTickerViaLlm("贵州茅台", {
    modelFactory: () => ({
      async invoke() {
        return {
          content: JSON.stringify({
            ticker: "600519.SS",
            companyName: "贵州茅台",
            market: "cn-a",
            confidence: "high",
          }),
        };
      },
    }),
  });

  assert.equal(result.ticker, "600519.SS");
  assert.equal(result.companyName, "贵州茅台");
  assert.equal(result.source, "llm");
});

test("resolveCompanyTicker resolves 贵州茅台 via LLM and quote verification", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { code: 200, data: { webPages: { value: [] } } };
    },
  });

  try {
    const result = await resolveCompanyTicker("贵州茅台", {
      verifyQuote: true,
      quoteChecker: mockMoutaiQuote,
      llmResolver: mockMoutaiLlm,
    });

    assert.equal(result.ticker, "600519.SS");
    assert.equal(result.source, "llm+quote");
    assert.equal(result.companyName, "贵州茅台");
  } finally {
    global.fetch = originalFetch;
  }
});

test("resolveResearchTargetsFromText resolves 调研贵州茅台 before agent run", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { code: 200, data: { webPages: { value: [] } } };
    },
  });

  try {
    const result = await resolveResearchTargetsFromText("调研贵州茅台", {
      verifyQuote: true,
      quoteChecker: mockMoutaiQuote,
      llmResolver: mockMoutaiLlm,
    });

    assert.deepEqual(result.tickers, ["600519.SS"]);
    assert.equal(result.details[0]?.query, "贵州茅台");
    assert.equal(result.details[0]?.source, "llm+quote");
  } finally {
    global.fetch = originalFetch;
  }
});

test("resolveResearchTargetsFromText resolves bare 贵州茅台 input", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { code: 200, data: { webPages: { value: [] } } };
    },
  });

  try {
    const result = await resolveResearchTargetsFromText("贵州茅台", {
      verifyQuote: true,
      quoteChecker: mockMoutaiQuote,
      llmResolver: mockMoutaiLlm,
    });

    assert.deepEqual(result.tickers, ["600519.SS"]);
  } finally {
    global.fetch = originalFetch;
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { rankTickerCandidatesFromText } from "../utils/company-ticker.mjs";
import { resolveCompanyTicker } from "../utils/resolve-company-ticker.mjs";

function mockBochaSearchResponse(summary) {
  return {
    ok: true,
    async json() {
      return {
        code: 200,
        data: {
          webPages: {
            value: [
              {
                name: "Company IPO",
                url: "https://example.com",
                summary,
                siteName: "Example",
                dateLastCrawled: "2026-06-01",
              },
            ],
          },
        },
      };
    },
  };
}

test("resolveCompanyTicker resolves company names via bocha search", async () => {
  const originalSearch = global.fetch;
  const originalApiKey = process.env.BOCHA_API_KEY;
  process.env.BOCHA_API_KEY = "test-key";
  global.fetch = async () =>
    mockBochaSearchResponse(
      'SpaceX began trading on Nasdaq under the ticker symbol "SPCX" at $135.',
    );

  try {
    const result = await resolveCompanyTicker("SpaceX", {
      verifyQuote: true,
      quoteChecker: async (ticker) =>
        ticker === "SPCX"
          ? { shortName: "Space Exploration Technologies Corp.", regularMarketPrice: 154.6 }
          : { error: "not found" },
    });
    assert.equal(result.ticker, "SPCX");
    assert.equal(result.source, "bocha+quote");
  } finally {
    global.fetch = originalSearch;
    if (originalApiKey === undefined) {
      delete process.env.BOCHA_API_KEY;
    } else {
      process.env.BOCHA_API_KEY = originalApiKey;
    }
  }
});

test("resolveCompanyTicker parses ticker from bocha search text", async () => {
  const originalSearch = global.fetch;
  const originalApiKey = process.env.BOCHA_API_KEY;
  process.env.BOCHA_API_KEY = "test-key";
  global.fetch = async () =>
    mockBochaSearchResponse("NewCo listed on NASDAQ: ABC at $20 per share.");

  try {
    const ranked = rankTickerCandidatesFromText(
      "NewCo listed on NASDAQ: ABC at $20 per share.",
      "NewCo",
    );
    assert.equal(ranked[0]?.ticker, "ABC");

    const result = await resolveCompanyTicker("NewCo", {
      verifyQuote: true,
      quoteChecker: async (ticker) =>
        ticker === "ABC"
          ? { shortName: "NewCo Inc.", regularMarketPrice: 21.2 }
          : { error: "not found" },
    });
    assert.equal(result.ticker, "ABC");
    assert.equal(result.source, "bocha+quote");
  } finally {
    global.fetch = originalSearch;
    if (originalApiKey === undefined) {
      delete process.env.BOCHA_API_KEY;
    } else {
      process.env.BOCHA_API_KEY = originalApiKey;
    }
  }
});

test("resolveCompanyTicker verifies direct ticker symbols without bocha", async () => {
  const originalSearch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return mockBochaSearchResponse("");
  };

  try {
    const result = await resolveCompanyTicker("SPCX", {
      verifyQuote: true,
      quoteChecker: async (ticker) =>
        ticker === "SPCX"
          ? { shortName: "Space Exploration Technologies Corp.", regularMarketPrice: 154.6 }
          : { error: "not found" },
    });
    assert.equal(result.ticker, "SPCX");
    assert.equal(result.source, "direct+yahoo");
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalSearch;
  }
});

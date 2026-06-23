import assert from "node:assert/strict";
import test from "node:test";

import { searchStockNews } from "../tools/bocha-search.mjs";

test("builds news query with ticker, company name, and theme", async () => {
  const originalApiKey = process.env.BOCHA_API_KEY;
  delete process.env.BOCHA_API_KEY;

  try {
    const result = await searchStockNews({
      ticker: "VIPS",
      companyName: "Vipshop Holdings Limited",
      theme: "电商股票",
      count: 5,
    });

    assert.equal(result.query, "VIPS Vipshop Holdings Limited stock latest news 电商股票");
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.BOCHA_API_KEY;
    } else {
      process.env.BOCHA_API_KEY = originalApiKey;
    }
  }
});

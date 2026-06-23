import assert from "node:assert/strict";
import test from "node:test";

import { getDomesticStockSnapshot } from "../tools/domestic-market.mjs";
import { getStockSnapshot } from "../tools/yahoo-finance.mjs";

const originalFetch = globalThis.fetch;

function mockEastMoneyResponse(data) {
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.match(url, /push2\.eastmoney\.com\/api\/qt\/stock\/get/);
    return {
      ok: true,
      async json() {
        return { rc: 0, data };
      },
    };
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("getDomesticStockSnapshot maps East Money fields for A-share", async () => {
  mockEastMoneyResponse({
    f43: 1223,
    f58: "贵州茅台",
    f60: 1241.41,
    f116: 1528849798023,
    f162: 14.03,
    f170: -1.48,
  });

  const snapshot = await getDomesticStockSnapshot("600519");

  assert.equal(snapshot.ticker, "600519.SS");
  assert.equal(snapshot.shortName, "贵州茅台");
  assert.equal(snapshot.currency, "CNY");
  assert.equal(snapshot.exchange, "上海证券交易所");
  assert.equal(snapshot.regularMarketPrice, 1223);
  assert.equal(snapshot.regularMarketChangePercent, -1.48);
  assert.equal(snapshot.trailingPE, 14.03);
  assert.equal(snapshot.source, "东方财富");
  assert.equal(snapshot.error, undefined);
});

test("getDomesticStockSnapshot maps East Money fields for HK stock", async () => {
  mockEastMoneyResponse({
    f43: 415.8,
    f58: "腾讯控股",
    f60: 433,
    f116: 3787155284358.6,
    f162: 0,
    f170: -3.97,
  });

  const snapshot = await getDomesticStockSnapshot("0700.HK");

  assert.equal(snapshot.ticker, "0700.HK");
  assert.equal(snapshot.currency, "HKD");
  assert.equal(snapshot.exchange, "香港交易所");
  assert.equal(snapshot.shortName, "腾讯控股");
});

test("getDomesticStockSnapshot returns error payload on API failure", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    statusText: "Bad Gateway",
  });

  const snapshot = await getDomesticStockSnapshot("600519");

  assert.match(snapshot.error, /502/);
  assert.equal(snapshot.source, "东方财富");
});

test("getStockSnapshot routes A-share to domestic provider", async () => {
  mockEastMoneyResponse({
    f43: 10.5,
    f58: "测试股份",
    f60: 10.2,
    f116: 1000000,
    f162: 12.3,
    f170: 2.94,
  });

  const snapshot = await getStockSnapshot("000001");

  assert.equal(snapshot.source, "东方财富");
  assert.equal(snapshot.ticker, "000001.SZ");
});

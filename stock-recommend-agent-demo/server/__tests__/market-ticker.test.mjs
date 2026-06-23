import assert from "node:assert/strict";
import test from "node:test";

import {
  isDomesticMarket,
  parseMarketTicker,
  toDisplayTicker,
  toEastMoneySecId,
} from "../utils/market-ticker.mjs";

test("parseMarketTicker recognizes A-share exchange suffixes", () => {
  assert.deepEqual(parseMarketTicker("600519.SS"), {
    market: "cn-a",
    exchange: "SSE",
    code: "600519",
    raw: "600519.SS",
    displayTicker: "600519.SS",
  });
  assert.deepEqual(parseMarketTicker("000001.SZ").exchange, "SZSE");
  assert.equal(parseMarketTicker("600519.SH").displayTicker, "600519.SS");
});

test("parseMarketTicker recognizes bare A-share and HK codes", () => {
  assert.equal(parseMarketTicker("600519").market, "cn-a");
  assert.equal(parseMarketTicker("300750").exchange, "SZSE");
  assert.deepEqual(parseMarketTicker("0700"), {
    market: "cn-hk",
    exchange: "HKEX",
    code: "0700",
    raw: "0700",
    displayTicker: "0700.HK",
  });
  assert.equal(parseMarketTicker("09988").displayTicker, "09988.HK");
});

test("parseMarketTicker treats US tickers as other markets", () => {
  assert.equal(parseMarketTicker("NVDA").market, "other");
  assert.equal(parseMarketTicker("BRK.B").market, "other");
});

test("isDomesticMarket only matches A-share and HK", () => {
  assert.equal(isDomesticMarket("600519"), true);
  assert.equal(isDomesticMarket("0700.HK"), true);
  assert.equal(isDomesticMarket("NVDA"), false);
});

test("toEastMoneySecId maps markets to secid", () => {
  assert.equal(toEastMoneySecId(parseMarketTicker("600519")), "1.600519");
  assert.equal(toEastMoneySecId(parseMarketTicker("000001.SZ")), "0.000001");
  assert.equal(toEastMoneySecId(parseMarketTicker("0700.HK")), "116.00700");
  assert.equal(toEastMoneySecId(parseMarketTicker("09988")), "116.09988");
});

test("toDisplayTicker returns normalized ticker symbol", () => {
  assert.equal(toDisplayTicker(parseMarketTicker("600519")), "600519.SS");
  assert.equal(toDisplayTicker(parseMarketTicker("NVDA")), "NVDA");
});

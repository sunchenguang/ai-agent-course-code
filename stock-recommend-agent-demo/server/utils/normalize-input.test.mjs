import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRequestBody, normalizeTickers } from "./normalize-input.mjs";

test("normalizes comma separated tickers into a unique uppercase list", () => {
  assert.deepEqual(normalizeTickers(" nvda, amd, NVDA, tsm "), [
    "NVDA",
    "AMD",
    "TSM",
  ]);
});

test("limits the ticker pool to five symbols", () => {
  assert.deepEqual(normalizeTickers("NVDA,AMD,TSM,AVGO,ASML,MSFT"), [
    "NVDA",
    "AMD",
    "TSM",
    "AVGO",
    "ASML",
  ]);
});

test("normalizes domestic tickers into exchange-qualified symbols", () => {
  assert.deepEqual(normalizeTickers("600519,0700"), ["600519.SS", "0700.HK"]);
});

test("throws when no valid ticker is provided", () => {
  assert.throws(() => normalizeTickers(" , "), /至少提供/);
});

test("uses tickerText when tickers is the default empty array", () => {
  assert.deepEqual(
    normalizeRequestBody({
      tickers: [],
      tickerText: "nvda, amd",
      theme: "AI 芯片股",
    }),
    {
      tickers: ["NVDA", "AMD"],
      theme: "AI 芯片股",
    },
  );
});

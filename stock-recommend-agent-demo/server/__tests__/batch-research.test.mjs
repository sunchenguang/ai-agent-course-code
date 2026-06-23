import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkspaceTicker, resolveYahooTicker } from "../agent/batch-research.mjs";

test("normalizeWorkspaceTicker strips exchange suffix", () => {
  assert.equal(normalizeWorkspaceTicker("600519.SH"), "600519");
  assert.equal(normalizeWorkspaceTicker("0700.HK"), "0700");
  assert.equal(normalizeWorkspaceTicker("nvda"), "NVDA");
});

test("resolveYahooTicker maps A-share and HK codes", () => {
  assert.equal(resolveYahooTicker("600519"), "600519.SS");
  assert.equal(resolveYahooTicker("600519.SH"), "600519.SS");
  assert.equal(resolveYahooTicker("0700"), "0700.HK");
  assert.equal(resolveYahooTicker("NVDA"), "NVDA");
});

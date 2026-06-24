import assert from "node:assert/strict";
import test from "node:test";

import { getDirectStockSnapshot } from "../tools/direct-quote.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = {
  MCP_QUOTE_ENABLED: process.env.MCP_QUOTE_ENABLED,
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv.MCP_QUOTE_ENABLED == null) {
    delete process.env.MCP_QUOTE_ENABLED;
  } else {
    process.env.MCP_QUOTE_ENABLED = originalEnv.MCP_QUOTE_ENABLED;
  }
});

test("getStockSnapshot uses direct provider when MCP disabled", async () => {
  process.env.MCP_QUOTE_ENABLED = "false";

  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.match(url, /push2\.eastmoney\.com\/api\/qt\/stock\/get/);
    return {
      ok: true,
      async json() {
        return {
          rc: 0,
          data: {
            f43: 100,
            f58: "测试股份",
            f60: 99,
            f116: 1_000_000_000_000,
            f162: 12.5,
            f170: 1.01,
          },
        };
      },
    };
  };

  const { getStockSnapshot } = await import("../tools/quote-provider.mjs");
  const snapshot = await getStockSnapshot("600519");

  assert.equal(snapshot.shortName, "测试股份");
  assert.equal(snapshot.source, "东方财富");
});

test("getDirectStockSnapshot unchanged for domestic tickers", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        rc: 0,
        data: {
          f43: 50,
          f58: "直连测试",
          f60: 49,
          f116: 500_000_000_000,
          f162: 8,
          f170: 2,
        },
      };
    },
  });

  const snapshot = await getDirectStockSnapshot("000001.SZ");
  assert.equal(snapshot.shortName, "直连测试");
  assert.equal(snapshot.source, "东方财富");
});

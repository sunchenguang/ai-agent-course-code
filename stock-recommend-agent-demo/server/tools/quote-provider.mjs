import { fetchQuoteViaMcp } from "../mcp/stock-sdk-quote-fetch.mjs";
import { isMcpQuoteEnabled } from "../mcp/mcp-config.mjs";
import { getDirectStockSnapshot } from "./direct-quote.mjs";

/**
 * 行情入口：MCP 启用时仅走 stock-sdk-mcp；未启用时走直连（东方财富 / Yahoo）
 */
export async function getStockSnapshot(ticker) {
  const normalized = String(ticker ?? "").trim();
  if (!normalized) {
    return {
      ticker: "",
      shortName: "",
      error: "empty ticker",
      source: "quote-provider",
    };
  }

  if (isMcpQuoteEnabled()) {
    return fetchQuoteViaMcp(normalized);
  }

  return getDirectStockSnapshot(normalized);
}

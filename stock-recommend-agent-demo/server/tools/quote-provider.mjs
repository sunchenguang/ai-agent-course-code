import { fetchQuoteViaMcp } from "../mcp/stock-sdk-quote-fetch.mjs";
import { isMcpQuoteEnabled } from "../mcp/mcp-config.mjs";
import { getDirectStockSnapshot } from "./direct-quote.mjs";

/**
 * 行情入口：优先使用 MCP；若 MCP 返回空数据，则回退到直连（东方财富 / Yahoo）
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

  if (!isMcpQuoteEnabled()) {
    return getDirectStockSnapshot(normalized);
  }

  const mcpSnapshot = await fetchQuoteViaMcp(normalized);
  const hasUsefulQuote =
    Number.isFinite(Number(mcpSnapshot?.regularMarketPrice)) ||
    Number.isFinite(Number(mcpSnapshot?.marketCap));

  if (hasUsefulQuote) {
    return mcpSnapshot;
  }

  const directSnapshot = await getDirectStockSnapshot(normalized);
  if (!directSnapshot.error) {
    return {
      ...directSnapshot,
      source: `${mcpSnapshot?.source ?? "MCP/stock-sdk-mcp"} → ${directSnapshot.source}`,
    };
  }

  return {
    ...mcpSnapshot,
    error: mcpSnapshot.error || directSnapshot.error,
  };
}

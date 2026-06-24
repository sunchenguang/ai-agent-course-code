import { resetMcpClient, callMcpTool } from "./mcp-client-pool.mjs";
import { isMcpQuoteEnabled } from "./mcp-config.mjs";
import {
  mapMcpQuoteToSnapshot,
  parseMcpQuotePayload,
  selectBestMcpQuote,
} from "./stock-sdk-quote.mjs";

export async function fetchQuoteViaMcp(ticker) {
  if (!isMcpQuoteEnabled()) return null;

  try {
    const result = await callMcpTool("get_quotes_by_query", { queries: [ticker] });
    const text = result.content?.map((item) => item.text ?? "").join("\n").trim();
    if (!text) {
      throw new Error("MCP quote response empty");
    }
    const results = parseMcpQuotePayload(text);
    const best = selectBestMcpQuote(results, ticker);
    if (!best) {
      throw new Error("MCP quote response has no matching result");
    }
    const snapshot = mapMcpQuoteToSnapshot(best, ticker);
    if (snapshot.regularMarketPrice == null && snapshot.marketCap == null) {
      throw new Error("MCP quote missing price and market cap");
    }
    return snapshot;
  } catch (error) {
    await resetMcpClient().catch(() => {});
    return {
      ticker: String(ticker ?? "").toUpperCase(),
      shortName: String(ticker ?? "").toUpperCase(),
      error: error instanceof Error ? error.message : String(error),
      source: "MCP/stock-sdk-mcp",
    };
  }
}

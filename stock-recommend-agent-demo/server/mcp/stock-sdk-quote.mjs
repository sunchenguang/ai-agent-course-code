import { parseMarketTicker, toDisplayTicker } from "../utils/market-ticker.mjs";

function pickNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function marketCapFromYi(value) {
  const yi = pickNumber(value);
  if (yi == null) return null;
  return yi * 1e8;
}

function exchangeFromMcpQuote(quote, parsed) {
  if (parsed?.exchange) {
    if (parsed.exchange === "SSE") return "上海证券交易所";
    if (parsed.exchange === "SZSE") return "深圳证券交易所";
    if (parsed.exchange === "HKEX") return "香港交易所";
  }
  if (quote.market === "A-Share") {
    const code = String(quote.code ?? "");
    if (code.startsWith("6") || code.startsWith("5")) return "上海证券交易所";
    return "深圳证券交易所";
  }
  if (quote.market === "HK") return "香港交易所";
  return quote.market ?? "";
}

function currencyFromMcpQuote(quote, parsed) {
  if (parsed?.market === "cn-hk") return "HKD";
  if (parsed?.market === "cn-a") return "CNY";
  if (quote.market === "HK") return "HKD";
  if (quote.market === "A-Share") return "CNY";
  const rawCurrency = quote.raw?.find?.((item) => item === "USD" || item === "CNY" || item === "HKD");
  return rawCurrency ?? "USD";
}

function tickerFromMcpQuote(quote, parsed, fallbackTicker) {
  if (parsed?.displayTicker) return parsed.displayTicker;
  const code = String(quote.code ?? fallbackTicker ?? "");
  if (/^\d{6}$/.test(code)) {
    return code.startsWith("6") || code.startsWith("5") ? `${code}.SS` : `${code}.SZ`;
  }
  if (/^\d{4,5}$/.test(code.replace(/\D/g, ""))) {
    const normalized = code.replace(/\D/g, "").padStart(4, "0");
    return `${normalized}.HK`;
  }
  return code.replace(/\.(OQ|N|PK)$/i, "") || fallbackTicker;
}

export function mapMcpQuoteToSnapshot(quote, fallbackTicker = "") {
  const parsed = parseMarketTicker(fallbackTicker || quote.code || quote.name || "");
  const ticker = tickerFromMcpQuote(quote, parsed, fallbackTicker);
  const reparsed = parseMarketTicker(ticker);

  return {
    ticker: toDisplayTicker(reparsed) || ticker,
    shortName: quote.name ?? toDisplayTicker(reparsed) ?? ticker,
    currency: currencyFromMcpQuote(quote, reparsed),
    exchange: exchangeFromMcpQuote(quote, reparsed),
    regularMarketPrice: pickNumber(quote.price),
    regularMarketChangePercent: pickNumber(quote.changePercent),
    regularMarketPreviousClose: pickNumber(quote.prevClose),
    marketCap: marketCapFromYi(quote.totalMarketCap),
    trailingPE: pickNumber(quote.pe ?? quote.peDynamic ?? quote.peStatic),
    forwardPE: null,
    fiftyTwoWeekLow: pickNumber(quote.low52w),
    fiftyTwoWeekHigh: pickNumber(quote.high52w),
    averageAnalystRating: "",
    source: "MCP/stock-sdk-mcp",
  };
}

export function parseMcpQuotePayload(text) {
  const payload = typeof text === "string" ? JSON.parse(text) : text;
  const results = payload?.results ?? payload?.data ?? [];
  if (!Array.isArray(results)) {
    throw new Error("MCP quote payload missing results array");
  }
  return results;
}

export function selectBestMcpQuote(results, fallbackTicker = "") {
  if (!results.length) return null;
  const normalized = String(fallbackTicker ?? "")
    .trim()
    .toUpperCase()
    .replace(/\.(SS|SZ|SH|HK)$/i, "");
  if (!normalized) return results[0];

  const exact = results.find((item) => {
    const code = String(item.code ?? "").toUpperCase().replace(/\.(OQ|N|PK)$/i, "");
    const name = String(item.name ?? "");
    return (
      code === normalized ||
      code.endsWith(normalized) ||
      name.toUpperCase() === normalized ||
      code.replace(/\D/g, "") === normalized.replace(/\D/g, "")
    );
  });
  return exact ?? results[0];
}

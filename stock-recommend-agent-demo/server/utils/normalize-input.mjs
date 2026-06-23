import { parseMarketTicker, toDisplayTicker } from "./market-ticker.mjs";

const MAX_TICKERS = 5;

function normalizeTickerItem(item) {
  const raw = String(item ?? "").trim().toUpperCase();
  if (!raw) return null;

  const parsed = parseMarketTicker(raw);
  if (parsed.market === "cn-a" || parsed.market === "cn-hk") {
    return toDisplayTicker(parsed);
  }

  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(raw)) {
    return raw;
  }

  return null;
}

export function normalizeTickers(input) {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
  const seen = new Set();
  const tickers = [];

  for (const item of raw) {
    const ticker = normalizeTickerItem(item);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
    if (tickers.length >= MAX_TICKERS) break;
  }

  if (!tickers.length) {
    throw new Error("至少提供 1 个有效股票代码");
  }

  return tickers;
}

export function normalizeRequestBody(body = {}) {
  const tickersInput =
    Array.isArray(body.tickers) && body.tickers.length === 0
      ? body.tickerText
      : body.tickers ?? body.tickerText;

  return {
    tickers: normalizeTickers(tickersInput),
    theme: String(body.theme ?? "AI 股票推荐").trim() || "AI 股票推荐",
  };
}

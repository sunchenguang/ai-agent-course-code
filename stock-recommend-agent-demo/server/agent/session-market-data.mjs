import { readSessionFile, listSessionFiles } from "./session-memory.mjs";
import { normalizeWorkspaceTicker, resolveYahooTicker } from "./batch-research.mjs";

function marketDataPath(ticker) {
  return `sources/market_data_${normalizeWorkspaceTicker(ticker)}.json`;
}

function newsPath(ticker) {
  return `sources/news_${normalizeWorkspaceTicker(ticker)}.json`;
}

function findingsPath(ticker) {
  return `sources/findings_${normalizeWorkspaceTicker(ticker)}.md`;
}

export function listSessionMarketDataTickers(sessionId) {
  return listSessionFiles(sessionId, "sources/")
    .filter((file) => /^sources\/market_data_[A-Z0-9.]+\.json$/i.test(file))
    .map((file) => file.match(/^sources\/market_data_(.+)\.json$/i)?.[1]?.toUpperCase())
    .filter(Boolean);
}

function collectStorageKeys(ticker) {
  const keys = new Set();
  const raw = String(ticker ?? "").trim();
  if (!raw) return [];

  const normalized = normalizeWorkspaceTicker(raw);
  if (normalized) keys.add(normalized);

  for (const variant of [raw, resolveYahooTicker(raw), resolveYahooTicker(normalized)]) {
    const key = normalizeWorkspaceTicker(variant);
    if (key) keys.add(key);
  }

  return [...keys];
}

export function readSessionMarketData(sessionId, ticker) {
  const storageKeys = collectStorageKeys(ticker);

  for (const key of storageKeys) {
    const raw = readSessionFile(sessionId, marketDataPath(key));
    if (raw) {
      return {
        storageKey: key,
        stockData: JSON.parse(raw),
        autoMatched: false,
        available: listSessionMarketDataTickers(sessionId),
      };
    }
  }

  const available = listSessionMarketDataTickers(sessionId);
  if (available.length === 1) {
    const key = available[0];
    const raw = readSessionFile(sessionId, marketDataPath(key));
    if (raw) {
      return {
        storageKey: key,
        stockData: JSON.parse(raw),
        autoMatched: true,
        available,
      };
    }
  }

  return {
    storageKey: storageKeys[0] ?? normalizeWorkspaceTicker(ticker),
    stockData: null,
    autoMatched: false,
    available,
  };
}

export function readSessionNews(sessionId, storageKey) {
  const raw = readSessionFile(sessionId, newsPath(storageKey));
  if (!raw) return { items: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { items: [] };
  }
}

export { marketDataPath, newsPath, findingsPath };

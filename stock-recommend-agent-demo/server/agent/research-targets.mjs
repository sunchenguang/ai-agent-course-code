import { normalizeWorkspaceTicker } from "./batch-research.mjs";
import { readSessionFile, writeSessionFile } from "./session-memory.mjs";
import { parseMarketTicker } from "../utils/market-ticker.mjs";

const RESEARCH_TARGETS_PATH = "sources/research_targets.json";

function normalizeResearchTargetDetails(details = []) {
  const seen = new Set();
  const normalized = [];
  for (const raw of details) {
    const ticker = normalizeWorkspaceTicker(raw?.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    normalized.push({
      ticker,
      name: String(raw?.name ?? raw?.companyName ?? "").trim(),
      companyName: String(raw?.companyName ?? raw?.name ?? "").trim(),
      sectorName: String(raw?.sectorName ?? "").trim(),
    });
  }
  return normalized;
}

export function normalizeResearchTargetList(tickers = []) {
  const seen = new Set();
  const normalized = [];
  for (const raw of tickers) {
    const ticker = normalizeWorkspaceTicker(raw);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    normalized.push(ticker);
  }
  return normalized;
}

export function writeResearchTargets(sessionId, { tickers = [], query = "", details = [] } = {}) {
  const normalizedTickers = normalizeResearchTargetList(tickers);
  const normalizedDetails = normalizeResearchTargetDetails(details);
  const payload = {
    query: String(query ?? "").trim(),
    tickers: normalizedTickers,
    details: normalizedDetails.length
      ? normalizedDetails
      : normalizedTickers.map((ticker) => ({ ticker, name: "", companyName: "" })),
    updatedAt: new Date().toISOString(),
  };
  writeSessionFile(sessionId, RESEARCH_TARGETS_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

export function readResearchTargets(sessionId) {
  const raw = readSessionFile(sessionId, RESEARCH_TARGETS_PATH);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readResearchTargetTickers(sessionId) {
  const parsed = readResearchTargets(sessionId);
  if (!parsed) return null;
  const tickers = normalizeResearchTargetList(parsed.tickers ?? []);
  return tickers.length ? tickers : null;
}

export function lookupResearchTarget(sessionId, input) {
  const payload = readResearchTargets(sessionId);
  if (!payload?.tickers?.length) return null;

  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const normalizedInput = normalizeWorkspaceTicker(raw);
  const parsedInput = parseMarketTicker(raw);
  const inputCode = parsedInput.code ?? (/^\d{6}$/.test(normalizedInput) ? normalizedInput : null);

  for (const ticker of payload.tickers) {
    const normalizedTicker = normalizeWorkspaceTicker(ticker);
    if (normalizedTicker === normalizedInput || (inputCode && normalizedTicker === inputCode)) {
      const detail = (payload.details ?? []).find(
        (item) => normalizeWorkspaceTicker(item.ticker) === normalizedTicker,
      );
      return {
        ticker: normalizedTicker,
        name: detail?.name ?? detail?.companyName ?? "",
        companyName: detail?.companyName ?? detail?.name ?? "",
        sectorName: detail?.sectorName ?? "",
        source: "research-target",
      };
    }
  }

  for (const detail of payload.details ?? []) {
    const names = [detail.name, detail.companyName].map((item) => String(item ?? "").trim()).filter(Boolean);
    for (const name of names) {
      if (raw === name || raw.includes(name)) {
        return {
          ticker: normalizeWorkspaceTicker(detail.ticker),
          name: detail.name ?? name,
          companyName: detail.companyName ?? name,
          sectorName: detail.sectorName ?? "",
          source: "research-target",
        };
      }
    }
  }

  return null;
}

export function filterTickersToResearchTargets(tickers = [], allowedTickers) {
  const normalized = normalizeResearchTargetList(tickers);
  if (!allowedTickers?.length) return normalized;
  const allowed = new Set(normalizeResearchTargetList(allowedTickers));
  const filtered = normalized.filter((ticker) => allowed.has(ticker));
  return filtered.length ? filtered : normalizeResearchTargetList(allowedTickers);
}

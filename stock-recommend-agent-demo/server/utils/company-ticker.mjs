import { parseMarketTicker, toDisplayTicker } from "./market-ticker.mjs";

const INVALID_TICKERS = new Set([
  "AI",
  "AM",
  "AMEX",
  "AND",
  "API",
  "CEO",
  "CFO",
  "CO",
  "ETF",
  "FOR",
  "HK",
  "IPO",
  "IT",
  "LLC",
  "NASDAQ",
  "NYSE",
  "PM",
  "SEC",
  "THE",
  "USD",
  "USA",
  "VS",
]);

const TICKER_PATTERNS = [
  /(?:NASDAQ|NYSE|AMEX)\s*[:：]?\s*([A-Z]{1,5})\b/gi,
  /(?:ticker symbol|stock symbol|trading symbol|symbol)\s*[:：]?\s*["“']?([A-Z]{1,5})["”']?/gi,
  /(?:trades under|trading under|listed under)\s+(?:the\s+)?(?:ticker\s+)?["“']?([A-Z]{1,5})["”']?/gi,
  /股票代码\s*[:：]?\s*(\d{6})(?:\.(?:SS|SZ|SH))?/gi,
  /(?:代码|代号|证券代码)\s*[:：]?\s*(\d{6})(?:\.(?:SS|SZ|SH))?/gi,
  /股票代码\s*[:：]?\s*([A-Z]{1,5})\b/gi,
  /(?:代码|代号)\s*[:：]?\s*([A-Z]{1,5})\b/gi,
  /under the ticker symbol\s+["“']?([A-Z]{1,5})["”']?/gi,
  /\b(\d{6})\.(SS|SZ|SH|HK)\b/gi,
  /\b(\d{4,5})\.HK\b/gi,
  /\$([A-Z]{1,5})\b/g,
  /(?:^|\s)\(([A-Z]{1,5})\)(?:\s|$)/g,
];

export function isLikelyTicker(value) {
  const ticker = String(value ?? "").trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) && !INVALID_TICKERS.has(ticker);
}

export function isResolvableTicker(value) {
  const parsed = parseMarketTicker(value);
  if (parsed.market === "cn-a" || parsed.market === "cn-hk") {
    return true;
  }
  return isLikelyTicker(value);
}

export function normalizeResolvableTicker(input) {
  const direct = normalizeCompanyOrTicker(input);
  if (direct) return direct;

  const parsed = parseMarketTicker(input);
  if (parsed.market === "cn-a" || parsed.market === "cn-hk") {
    return toDisplayTicker(parsed);
  }

  return null;
}

export function normalizeCompanyOrTicker(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const spaced = raw.toUpperCase().replace(/\s+/g, " ").trim();

  if (!/\s/.test(raw) && isLikelyTicker(spaced)) {
    const isMixedCaseCompany = /[a-z]/.test(raw) && /[A-Z]/.test(raw);
    if (!isMixedCaseCompany) {
      return spaced;
    }
  }

  return null;
}

export function extractTickersFromText(text) {
  const source = String(text ?? "");
  const results = [];
  const seen = new Set();

  function addTicker(raw) {
    const ticker = normalizeResolvableTicker(raw);
    if (!ticker || !isResolvableTicker(ticker) || seen.has(ticker)) return;
    seen.add(ticker);
    results.push(ticker);
  }

  for (const match of source.matchAll(/\b[A-Z][A-Z0-9.-]{0,9}\b/g)) {
    addTicker(match[0]);
  }

  for (const match of source.matchAll(/\b(\d{6})(?:\.(?:SS|SZ|SH))?\b/gi)) {
    addTicker(match[0]);
  }

  for (const match of source.matchAll(/\b(\d{4,5})\.HK\b/gi)) {
    addTicker(match[0]);
  }

  return results.slice(0, 5);
}

export function extractCompanyNameCandidates(text, knownTickers = []) {
  const source = String(text ?? "").trim();
  if (!source) return [];

  const blocked = new Set(
    knownTickers.map((item) => normalizeCompanyOrTicker(item)).filter(Boolean),
  );
  const candidates = [];

  function addCandidate(raw) {
    const value = String(raw ?? "")
      .trim()
      .replace(/[，,。.!！?？；;]+$/g, "")
      .replace(/\s+(的|股票|公司|股份|集团)$/u, "")
      .trim();
    if (!value || value.length < 2 || value.length > 48) return;
    if (/^(调研|研究|分析|对比|推荐|看看|帮我|请)/u.test(value)) return;

    for (const part of value.split(/\s*(?:和|与|、|,|\/|&|\band\b)\s*/iu)) {
      const segment = part.trim();
      if (!segment || segment.length < 2) continue;
      if (normalizeCompanyOrTicker(segment)) continue;
      if (blocked.has(normalizeCompanyOrTicker(segment))) continue;
      candidates.push(segment);
    }
  }

  for (const match of source.matchAll(
    /(?:调研|研究|分析|看看|对比|推荐|research|analyze)\s*[:：]?\s*([A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff\s.&'-]{0,40})/gi,
  )) {
    addCandidate(match[1]);
  }

  if (!candidates.length) {
    const cleaned = source
      .replace(/^(请|帮我|帮忙)?\s*(调研|研究|分析|看看|对比|推荐)\s*/iu, "")
      .trim();
    if (cleaned && cleaned !== source && !normalizeCompanyOrTicker(cleaned)) {
      addCandidate(cleaned);
    }
  }

  if (!candidates.length && /[\u4e00-\u9fff]/.test(source)) {
    const bareName = source
      .replace(/[，,。.!！?？；;]+$/g, "")
      .replace(/\s+(的|股票|公司|股份|集团)$/u, "")
      .trim();
    if (
      bareName.length >= 2 &&
      bareName.length <= 20 &&
      !normalizeCompanyOrTicker(bareName) &&
      !normalizeResolvableTicker(bareName)
    ) {
      addCandidate(bareName);
    }
  }

  return [...new Set(candidates)];
}

export function rankTickerCandidatesFromText(text, companyName = "") {
  const haystack = String(text ?? "");
  if (!haystack.trim()) return [];

  const scores = new Map();

  function addScore(rawTicker, points, source) {
    const parsed = parseMarketTicker(rawTicker);
    const normalized =
      parsed.market === "cn-a" || parsed.market === "cn-hk"
        ? toDisplayTicker(parsed)
        : String(rawTicker ?? "").trim().toUpperCase();
    if (!isResolvableTicker(normalized)) return;
    const current = scores.get(normalized) ?? { ticker: normalized, score: 0, sources: new Set() };
    current.score += points;
    current.sources.add(source);
    scores.set(normalized, current);
  }

  for (const pattern of TICKER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of haystack.matchAll(pattern)) {
      addScore(match[1], 3, "pattern");
    }
  }

  for (const match of haystack.matchAll(/\b[A-Z]{2,5}\b/g)) {
    addScore(match[0], 1, "token");
  }

  const companyTokens = String(companyName ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 2);

  for (const [ticker, entry] of scores) {
    if (companyTokens.some((token) => ticker.includes(token) || token.includes(ticker))) {
      entry.score += 2;
    }
  }

  return [...scores.values()]
    .sort((left, right) => right.score - left.score)
    .map(({ ticker, score, sources }) => ({
      ticker,
      score,
      source: [...sources].join("+"),
    }));
}

export function formatResearchTargetHint(resolved) {
  const tickers = Array.isArray(resolved) ? resolved : resolved?.tickers ?? [];
  const details = Array.isArray(resolved) ? [] : resolved?.details ?? [];

  if (!tickers.length && !details.some((item) => !item.ticker)) {
    return "";
  }

  const lines = [];

  if (tickers.length) {
    lines.push("已从用户输入识别到以下研究标的：");
    for (const ticker of tickers) {
      const detail = details.find((item) => item.ticker === ticker);
      if (detail?.companyName && detail.companyName !== ticker) {
        lines.push(`- **${ticker}**（${detail.companyName}，来源：${detail.source ?? "解析"}）`);
      } else {
        lines.push(`- **${ticker}**`);
      }
    }
  }

  const unresolved = details.filter((item) => !item.ticker);
  if (unresolved.length) {
    lines.push("", "以下名称暂未解析到可验证 ticker：");
    for (const item of unresolved) {
      lines.push(`- ${item.query}${item.warning ? `（${item.warning}）` : ""}`);
    }
  }

  return [
    "## 本轮用户请求解析提示",
    ...lines,
    "",
    "请先基于上述 ticker 委派 market-researcher；若仍有未解析名称，调用 resolve_company_ticker 后再调研。",
    "**禁止**在未调用解析/行情工具前断言「未上市/无股票代码」。",
  ].join("\n");
}

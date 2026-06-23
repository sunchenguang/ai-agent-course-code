import { searchCompanyTickerCandidates } from "../tools/bocha-search.mjs";
import { getStockSnapshot } from "../tools/yahoo-finance.mjs";
import {
  extractCompanyNameCandidates,
  extractTickersFromText,
  isLikelyTicker,
  isResolvableTicker,
  normalizeCompanyOrTicker,
  normalizeResolvableTicker,
  rankTickerCandidatesFromText,
} from "./company-ticker.mjs";
import { resolveTickerViaLlm } from "./llm-ticker-resolve.mjs";
import { parseMarketTicker, toDisplayTicker } from "./market-ticker.mjs";

async function verifyListedTicker(ticker, quoteChecker = getStockSnapshot) {
  const snapshot = await quoteChecker(ticker);
  if (snapshot.error) {
    return { ok: false, snapshot };
  }
  if (snapshot.regularMarketPrice == null && snapshot.marketCap == null) {
    return { ok: false, snapshot };
  }
  return { ok: true, snapshot };
}

function buildResolvedResult({
  query,
  ticker,
  companyName,
  source,
  confidence,
  candidates = [],
  searchQuery,
  warning,
}) {
  return {
    query,
    ticker,
    companyName,
    source,
    confidence,
    candidates,
    ...(searchQuery ? { searchQuery } : {}),
    ...(warning ? { warning } : {}),
  };
}

async function verifyAndReturnDirectTicker(query, ticker, quoteChecker, verifyQuote) {
  if (!verifyQuote) {
    return buildResolvedResult({
      query,
      ticker,
      companyName: query,
      source: "direct",
      confidence: "medium",
      candidates: [{ ticker, score: 100, source: "direct" }],
    });
  }

  const verified = await verifyListedTicker(ticker, quoteChecker);
  if (!verified.ok) {
    return null;
  }

  const market = parseMarketTicker(ticker).market;
  const source =
    market === "cn-a" || market === "cn-hk" ? "direct+domestic" : "direct+yahoo";

  return buildResolvedResult({
    query,
    ticker: verified.snapshot.ticker ?? ticker,
    companyName: verified.snapshot.shortName ?? query,
    source,
    confidence: "high",
    candidates: [{ ticker, score: 100, source: "direct" }],
  });
}

async function tryResolveViaLlm(
  query,
  { verifyQuote, quoteChecker, ranked, searchQuery, searchWarning, llmResolver = resolveTickerViaLlm },
) {
  const llmResult = await llmResolver(query);
  if (!llmResult.ticker) {
    return null;
  }

  const candidates = [
    ...ranked,
    { ticker: llmResult.ticker, score: 5, source: "llm" },
  ];

  if (!verifyQuote) {
    return buildResolvedResult({
      query,
      ticker: llmResult.ticker,
      companyName: llmResult.companyName ?? query,
      source: "llm",
      confidence: llmResult.confidence ?? "medium",
      candidates,
      searchQuery,
      ...(searchWarning ? { warning: searchWarning } : {}),
    });
  }

  const verified = await verifyListedTicker(llmResult.ticker, quoteChecker);
  if (!verified.ok) {
    return null;
  }

  return buildResolvedResult({
    query,
    ticker: verified.snapshot.ticker ?? llmResult.ticker,
    companyName: verified.snapshot.shortName ?? llmResult.companyName ?? query,
    source: "llm+quote",
    confidence: llmResult.confidence === "high" ? "high" : "medium",
    candidates,
    searchQuery,
    ...(searchWarning ? { warning: searchWarning } : {}),
  });
}

export async function resolveCompanyTicker(
  companyName,
  { verifyQuote = true, quoteChecker = getStockSnapshot, llmResolver = resolveTickerViaLlm } = {},
) {
  const query = String(companyName ?? "").trim();
  if (!query) {
    return {
      query,
      ticker: null,
      warning: "公司名为空",
      candidates: [],
    };
  }

  const directTicker = normalizeCompanyOrTicker(query);
  if (directTicker && isLikelyTicker(directTicker)) {
    const resolved = await verifyAndReturnDirectTicker(
      query,
      directTicker,
      quoteChecker,
      verifyQuote,
    );
    if (resolved) return resolved;
  }

  const domesticTicker = normalizeResolvableTicker(query);
  if (domesticTicker && isResolvableTicker(domesticTicker)) {
    const parsed = parseMarketTicker(domesticTicker);
    if (parsed.market === "cn-a" || parsed.market === "cn-hk") {
      const resolved = await verifyAndReturnDirectTicker(
        query,
        toDisplayTicker(parsed),
        quoteChecker,
        verifyQuote,
      );
      if (resolved) return resolved;
    }
  }

  const search = await searchCompanyTickerCandidates(query);
  const ranked = rankTickerCandidatesFromText(
    search.items.map((item) => `${item.title}\n${item.summary}`).join("\n"),
    query,
  );

  if (!verifyQuote) {
    const top = ranked[0];
    if (top?.ticker) {
      return buildResolvedResult({
        query,
        ticker: top.ticker,
        companyName: query,
        source: "bocha",
        confidence: "medium",
        candidates: ranked,
        searchQuery: search.query,
        ...(search.warning ? { warning: search.warning } : {}),
      });
    }

    const llmResolved = await tryResolveViaLlm(query, {
      verifyQuote,
      quoteChecker,
      ranked,
      searchQuery: search.query,
      searchWarning: search.warning,
      llmResolver,
    });
    if (llmResolved) return llmResolved;

    return {
      query,
      ticker: null,
      companyName: query,
      source: "unresolved",
      confidence: "low",
      candidates: ranked,
      searchQuery: search.query,
      warning: search.warning ?? "未能从搜索结果解析股票代码",
    };
  }

  for (const candidate of ranked.slice(0, 5)) {
    const verified = await verifyListedTicker(candidate.ticker, quoteChecker);
    if (verified.ok) {
      return buildResolvedResult({
        query,
        ticker: verified.snapshot.ticker ?? candidate.ticker,
        companyName: verified.snapshot.shortName ?? query,
        source: "bocha+quote",
        confidence: candidate.score >= 3 ? "high" : "medium",
        candidates: ranked,
        searchQuery: search.query,
        ...(search.warning ? { warning: search.warning } : {}),
      });
    }
  }

  const llmResolved = await tryResolveViaLlm(query, {
    verifyQuote,
    quoteChecker,
    ranked,
    searchQuery: search.query,
    searchWarning: search.warning,
    llmResolver,
  });
  if (llmResolved) return llmResolved;

  return {
    query,
    ticker: null,
    warning: search.warning ?? "未能验证有效上市股票代码，请用户提供 ticker 或更换关键词",
    candidates: ranked,
    searchQuery: search.query,
  };
}

function normalizeStoredTicker(ticker) {
  return normalizeResolvableTicker(ticker) ?? normalizeCompanyOrTicker(ticker) ?? ticker;
}

export async function resolveResearchTargetsFromText(
  text,
  { verifyQuote = true, quoteChecker = getStockSnapshot, llmResolver = resolveTickerViaLlm } = {},
) {
  const explicitTickers = extractTickersFromText(text);
  const companyNames = extractCompanyNameCandidates(text, explicitTickers);

  const tickers = [];
  const details = [];
  const seen = new Set();

  function addTicker(ticker, detail) {
    const normalized = normalizeStoredTicker(ticker);
    if (!normalized || !isResolvableTicker(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    tickers.push(normalized);
    if (detail) details.push(detail);
  }

  for (const ticker of explicitTickers) {
    if (verifyQuote) {
      const verified = await verifyListedTicker(ticker, quoteChecker);
      addTicker(ticker, {
        query: ticker,
        ticker: normalizeStoredTicker(ticker),
        companyName: verified.ok ? verified.snapshot.shortName : ticker,
        source: verified.ok ? "explicit+quote" : "explicit",
        confidence: verified.ok ? "high" : "medium",
        ...(verified.ok ? {} : { warning: verified.snapshot.error ?? "行情验证失败" }),
      });
    } else {
      addTicker(ticker, { query: ticker, ticker, source: "explicit", confidence: "medium" });
    }
  }

  for (const name of companyNames) {
    const normalizedNameTicker = normalizeStoredTicker(name);
    if (normalizedNameTicker && seen.has(normalizedNameTicker)) {
      continue;
    }

    const resolved = await resolveCompanyTicker(name, { verifyQuote, quoteChecker, llmResolver });
    details.push({
      query: name,
      ticker: resolved.ticker,
      companyName: resolved.companyName ?? name,
      source: resolved.source ?? "unresolved",
      confidence: resolved.confidence ?? "low",
      candidates: resolved.candidates ?? [],
      ...(resolved.warning ? { warning: resolved.warning } : {}),
    });

    if (resolved.ticker) {
      addTicker(resolved.ticker);
    }
  }

  return {
    tickers: tickers.slice(0, 5),
    details,
  };
}

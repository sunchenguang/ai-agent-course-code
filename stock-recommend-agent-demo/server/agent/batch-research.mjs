import { analyzeSentimentCandidates } from "../nodes/analyze-sentiment.mjs";
import { searchStockNews } from "../tools/bocha-search.mjs";
import { getStockSnapshot } from "../tools/yahoo-finance.mjs";
import { createChatModel } from "../utils/llm.mjs";
import { computeRankingFromSessionMemory } from "./ranking-from-workspace.mjs";
import { setSessionRanking, writeSessionFile } from "./session-memory.mjs";

const MAX_TICKERS = 5;

export function normalizeWorkspaceTicker(ticker) {
  return String(ticker ?? "")
    .trim()
    .toUpperCase()
    .replace(/\.(SS|SZ|SH|HK)$/i, "");
}

export function resolveYahooTicker(ticker) {
  const normalized = normalizeWorkspaceTicker(ticker);
  if (/^\d{6}$/.test(normalized)) {
    if (normalized.startsWith("6")) return `${normalized}.SS`;
    if (normalized.startsWith("0") || normalized.startsWith("3")) return `${normalized}.SZ`;
  }
  if (/^\d{4,5}$/.test(normalized)) return `${normalized.padStart(4, "0")}.HK`;
  return String(ticker ?? "").trim().toUpperCase();
}

function marketDataFileName(ticker) {
  return `sources/market_data_${normalizeWorkspaceTicker(ticker)}.json`;
}

function findingsFileName(ticker) {
  return `sources/findings_${normalizeWorkspaceTicker(ticker)}.md`;
}

function newsFileName(ticker) {
  return `sources/news_${normalizeWorkspaceTicker(ticker)}.json`;
}

export function buildFindingsMarkdown({ ticker, name, news, sentiment }) {
  const lines = [
    "```json",
    JSON.stringify(sentiment, null, 2),
    "```",
    "",
    `## ${name}（${ticker}）新闻摘要`,
    "",
  ];

  if (news?.warning) {
    lines.push(`> ${news.warning}`, "");
  }

  const items = news?.items ?? [];
  if (!items.length) {
    lines.push("未找到近期相关新闻。", "");
  } else {
    for (const item of items.slice(0, 5)) {
      lines.push(
        `### ${item.title}`,
        `- URL: ${item.url}`,
        `- 来源: ${item.siteName} · ${item.publishedAt}`,
        `- 摘要: ${item.summary}`,
        "",
      );
    }
  }

  return lines.join("\n");
}

function buildCandidate(stock, news) {
  const ticker = normalizeWorkspaceTicker(stock.ticker);
  const riskFlags = [
    ...(stock.error ? ["行情获取失败"] : []),
    ...(news.warning ? [news.warning] : []),
    ...(news.items?.length ? [] : ["近期新闻不足"]),
  ];

  return {
    ticker,
    name: stock.shortName ?? ticker,
    stockData: { ...stock, ticker },
    news,
    riskFlags,
  };
}

export async function runBatchStockResearch(sessionId, { tickers = [], theme = "" } = {}) {
  const uniqueTickers = [];
  const seen = new Set();
  for (const raw of tickers) {
    const ticker = normalizeWorkspaceTicker(raw);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    uniqueTickers.push(ticker);
    if (uniqueTickers.length >= MAX_TICKERS) break;
  }

  if (!uniqueTickers.length) {
    throw new Error("至少提供 1 个有效股票代码");
  }

  const snapshots = await Promise.all(
    uniqueTickers.map((ticker) => getStockSnapshot(resolveYahooTicker(ticker))),
  );
  const newsResults = await Promise.all(
    snapshots.map((stock) =>
      searchStockNews({
        ticker: stock.ticker,
        companyName: stock.shortName,
        theme,
        count: 5,
      }),
    ),
  );

  const candidates = snapshots.map((stock, index) => buildCandidate(stock, newsResults[index]));
  const model = createChatModel({ temperature: 0 });
  const { candidates: enriched, errors } = await analyzeSentimentCandidates(candidates, model, []);
  const writtenFiles = [];

  for (const candidate of enriched) {
    writeSessionFile(
      sessionId,
      marketDataFileName(candidate.ticker),
      JSON.stringify(candidate.stockData, null, 2),
    );
    writeSessionFile(
      sessionId,
      findingsFileName(candidate.ticker),
      buildFindingsMarkdown({
        ticker: candidate.ticker,
        name: candidate.name,
        news: candidate.news,
        sentiment: candidate.sentiment,
      }),
    );
    writeSessionFile(
      sessionId,
      newsFileName(candidate.ticker),
      JSON.stringify(candidate.news ?? { items: [] }, null, 2),
    );
    writtenFiles.push(
      marketDataFileName(candidate.ticker),
      findingsFileName(candidate.ticker),
      newsFileName(candidate.ticker),
    );
  }

  const ranking = computeRankingFromSessionMemory(sessionId, { theme });
  setSessionRanking(sessionId, ranking);
  writtenFiles.push("sources/ranking.json");

  return {
    theme: ranking.theme,
    tickers: enriched.map((item) => item.ticker),
    ranking: ranking.ranking,
    files: writtenFiles,
    errors,
  };
}

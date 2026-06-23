import fs from "node:fs";
import path from "node:path";

import { scoreCandidates } from "../utils/scoring.mjs";
import { listSessionFiles, readSessionFile } from "./session-memory.mjs";
function parseSentimentFromFindings(content) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (!fenced) {
    return {
      label: "neutral",
      confidence: 0.5,
      reason: "findings 中未找到情绪 JSON，暂按中性处理。",
    };
  }
  try {
    const parsed = JSON.parse(fenced.trim());
    if (!["bullish", "neutral", "bearish"].includes(parsed.label)) {
      throw new Error("invalid label");
    }
    return {
      label: parsed.label,
      confidence: Number(parsed.confidence) || 0.5,
      reason: String(parsed.reason ?? "未提供解释"),
    };
  } catch {
    return {
      label: "neutral",
      confidence: 0.5,
      reason: "findings 情绪 JSON 解析失败，暂按中性处理。",
    };
  }
}

function buildRiskFlags(stockData, news = {}) {
  const riskFlags = [];
  if (stockData.error) riskFlags.push("行情获取失败");
  if (news.warning) riskFlags.push(news.warning);
  if (!(news.items?.length)) riskFlags.push("近期新闻不足");
  return riskFlags;
}

function readNewsPayload(newsContent, findingsContent) {
  if (newsContent) {
    try {
      const parsed = JSON.parse(newsContent);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // fall through to findings fallback
    }
  }

  const newsWarning = findingsContent.includes("未配置 BOCHA_API_KEY")
    ? "未配置 BOCHA_API_KEY，跳过新闻搜索"
    : "";
  return {
    items: [],
    ...(newsWarning ? { warning: newsWarning } : {}),
  };
}

function compactNews(news = {}) {
  return {
    query: news.query,
    warning: news.warning,
    items: (news.items ?? []).slice(0, 5),
  };
}

export function computeRankingFromEntries(entries, { theme = "" } = {}) {
  if (!entries.length) {
    throw new Error("未找到 market_data_*.json，请先完成调研");
  }

  const candidates = entries.map(({ ticker, stockData, findingsContent, newsContent }) => {
    const sentiment = parseSentimentFromFindings(findingsContent);
    const news = readNewsPayload(newsContent, findingsContent);

    return {
      ticker,
      name: stockData.shortName ?? ticker,
      stockData,
      news,
      sentiment,
      riskFlags: buildRiskFlags(stockData, news),
    };
  });

  const ranked = scoreCandidates(candidates);

  return {
    theme,
    generatedAt: new Date().toISOString().slice(0, 10),
    methodology: "momentum 30% + fundamentals 20% + sentiment 30% + riskControl 20%",
    ranking: ranked.map((item) => ({
      ticker: item.ticker,
      name: item.name,
      score: item.score,
      rating: item.rating,
      factors: item.factors,
      riskFlags: item.riskFlags,
      sentiment: item.sentiment,
      news: compactNews(item.news),
      stockData: {
        regularMarketPrice: item.stockData?.regularMarketPrice,
        regularMarketChangePercent: item.stockData?.regularMarketChangePercent,
        currency: item.stockData?.currency,
        trailingPE: item.stockData?.trailingPE,
        forwardPE: item.stockData?.forwardPE,
        source: item.stockData?.source,
      },
    })),
  };
}

export function computeRankingFromSessionMemory(sessionId, { theme = "" } = {}) {
  const marketFiles = listSessionFiles(sessionId, "sources/").filter((file) =>
    /^sources\/market_data_[A-Z0-9.]+\.json$/i.test(file),
  );

  const entries = marketFiles.map((file) => {
    const ticker = file.match(/^sources\/market_data_(.+)\.json$/i)?.[1]?.toUpperCase() ?? file;
    const stockData = JSON.parse(readSessionFile(sessionId, file) ?? "{}");
    const findingsContent = readSessionFile(sessionId, `sources/findings_${ticker}.md`) ?? "";
    const newsContent = readSessionFile(sessionId, `sources/news_${ticker}.json`) ?? "";
    return { ticker, stockData, findingsContent, newsContent };
  });

  return computeRankingFromEntries(entries, { theme });
}

export function computeRankingFromSessionDir(sourcesDir, { theme = "" } = {}) {
  if (!fs.existsSync(sourcesDir)) {
    throw new Error(`sources 目录不存在: ${sourcesDir}`);
  }

  const files = fs.readdirSync(sourcesDir);
  const marketFiles = files.filter((f) => /^market_data_[A-Z0-9.]+\.json$/i.test(f));

  if (!marketFiles.length) {
    throw new Error("未找到 market_data_*.json，请先完成 market-researcher 调研");
  }

  const entries = marketFiles.map((file) => {
    const ticker = file.match(/^market_data_(.+)\.json$/i)?.[1]?.toUpperCase() ?? file;
    const stockData = JSON.parse(fs.readFileSync(path.join(sourcesDir, file), "utf8"));
    const findingsPath = path.join(sourcesDir, `findings_${ticker}.md`);
    const findingsContent = fs.existsSync(findingsPath)
      ? fs.readFileSync(findingsPath, "utf8")
      : "";
    const newsPath = path.join(sourcesDir, `news_${ticker}.json`);
    const newsContent = fs.existsSync(newsPath) ? fs.readFileSync(newsPath, "utf8") : "";
    return { ticker, stockData, findingsContent, newsContent };
  });

  return computeRankingFromEntries(entries, { theme });
}

export function writeRankingJson(sourcesDir, ranking) {
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.writeFileSync(path.join(sourcesDir, "ranking.json"), JSON.stringify(ranking, null, 2), "utf8");
  return ranking;
}

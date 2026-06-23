import { tool } from "langchain";
import { z } from "zod";

import { searchStockNews } from "../tools/bocha-search.mjs";
import { getStockSnapshot } from "../tools/yahoo-finance.mjs";
import { normalizeCompanyOrTicker } from "../utils/company-ticker.mjs";
import { resolveCompanyTicker } from "../utils/resolve-company-ticker.mjs";
import {
  buildFindingsMarkdown,
  normalizeWorkspaceTicker,
  resolveYahooTicker,
} from "./batch-research.mjs";
import { readSessionFile, writeSessionFile } from "./session-memory.mjs";

function marketDataPath(ticker) {
  return `sources/market_data_${normalizeWorkspaceTicker(ticker)}.json`;
}

function newsPath(ticker) {
  return `sources/news_${normalizeWorkspaceTicker(ticker)}.json`;
}

function findingsPath(ticker) {
  return `sources/findings_${normalizeWorkspaceTicker(ticker)}.md`;
}

const sentimentSchema = z.object({
  label: z.enum(["bullish", "neutral", "bearish"]).describe("情绪标签"),
  confidence: z.number().min(0).max(1).describe("置信度 0-1"),
  reason: z.string().min(1).describe("中文理由"),
});

async function resolveTickerInput(input) {
  const raw = String(input ?? "").trim();
  const alias = normalizeCompanyOrTicker(raw);
  if (alias) {
    const snapshot = await getStockSnapshot(alias);
    if (!snapshot.error) {
      return { ticker: alias, companyName: snapshot.shortName ?? raw, source: "direct" };
    }
  }

  const resolved = await resolveCompanyTicker(raw);
  if (resolved.ticker) {
    return {
      ticker: resolved.ticker,
      companyName: resolved.companyName ?? raw,
      source: resolved.source ?? "resolve",
    };
  }

  return {
    ticker: alias ?? raw.toUpperCase(),
    companyName: raw,
    source: "fallback",
    warning: resolved.warning,
  };
}

export function createResolveCompanyTickerTool() {
  return tool(
    async ({ companyName }) => {
      const result = await resolveCompanyTicker(companyName);
      return JSON.stringify(result, null, 2);
    },
    {
      name: "resolve_company_ticker",
      description:
        "将公司名称解析为可交易的 ticker。会联网搜索、调用 LLM 识别代码，并用行情接口验证。用户给公司名而非代码时必须先调用。",
      schema: z.object({
        companyName: z.string().min(1).describe("公司名称或简称，如 SpaceX、Stripe"),
      }),
    },
  );
}

export function createSessionFetchQuoteTool(sessionId) {
  return tool(
    async ({ ticker }) => {
      const resolved = await resolveTickerInput(ticker);
      const normalized = normalizeWorkspaceTicker(resolved.ticker);
      const snapshot = await getStockSnapshot(resolveYahooTicker(resolved.ticker));
      const payload = {
        ...snapshot,
        ticker: normalized,
        resolvedFrom: resolved.companyName,
        resolveSource: resolved.source,
        ...(resolved.warning ? { resolveWarning: resolved.warning } : {}),
      };
      writeSessionFile(sessionId, marketDataPath(normalized), JSON.stringify(payload, null, 2));
      return JSON.stringify(payload, null, 2);
    },
    {
      name: "fetch_stock_quote",
      description:
        "获取单只股票行情快照并写入会话内存。支持公司名或 ticker；会先尝试解析 ticker 再拉行情。",
      schema: z.object({
        ticker: z.string().min(1).describe("股票代码或公司名称，如 NVDA、SpaceX"),
      }),
    },
  );
}

export function createSessionSearchNewsTool(sessionId) {
  return tool(
    async ({ ticker, companyName, theme, count }) => {
      const resolved = await resolveTickerInput(ticker);
      const normalized = normalizeWorkspaceTicker(resolved.ticker);
      const result = await searchStockNews({
        ticker: resolveYahooTicker(resolved.ticker),
        companyName: companyName ?? resolved.companyName,
        theme,
        count: count ?? 5,
      });
      writeSessionFile(sessionId, newsPath(normalized), JSON.stringify(result, null, 2));

      const lines = (result.items ?? []).map(
        (item, index) =>
          `${index + 1}. ${item.title}\nURL: ${item.url}\n摘要: ${item.summary}\n来源: ${item.siteName} · ${item.publishedAt}`,
      );
      const header = result.warning
        ? `警告: ${result.warning}\n查询: ${result.query}\n\n`
        : `查询: ${result.query}\n\n`;
      return header + (lines.length ? lines.join("\n\n") : "未找到相关新闻。");
    },
    {
      name: "search_stock_news",
      description: "搜索单只股票近期新闻，结果写入会话内存。",
      schema: z.object({
        ticker: z.string().min(1).describe("股票代码或公司名称"),
        companyName: z.string().optional().describe("公司名称，可选"),
        theme: z.string().optional().describe("研究主题，如 AI 芯片股"),
        count: z.number().int().min(1).max(10).optional().describe("结果数量，默认 5"),
      }),
    },
  );
}

export function createSaveFindingsTool(sessionId) {
  return tool(
    async ({ ticker, name, sentiment }) => {
      const resolved = await resolveTickerInput(ticker);
      const normalized = normalizeWorkspaceTicker(resolved.ticker);
      const stockRaw = readSessionFile(sessionId, marketDataPath(normalized));
      if (!stockRaw) {
        throw new Error(`未找到 ${normalized} 行情数据，请先调用 fetch_stock_quote`);
      }

      const stockData = JSON.parse(stockRaw);
      const newsRaw = readSessionFile(sessionId, newsPath(normalized));
      const news = newsRaw ? JSON.parse(newsRaw) : { items: [] };
      const markdown = buildFindingsMarkdown({
        ticker: normalized,
        name: name?.trim() || stockData.shortName || normalized,
        news,
        sentiment,
      });
      writeSessionFile(sessionId, findingsPath(normalized), markdown);
      return `已保存 ${normalized} 调研笔记与情绪分析`;
    },
    {
      name: "save_stock_findings",
      description:
        "将情绪分析结果写入会话内存（findings 文件）。必须在 fetch_stock_quote 与 search_stock_news 之后调用。",
      schema: z.object({
        ticker: z.string().min(1).describe("股票代码"),
        name: z.string().optional().describe("公司名称，可选"),
        sentiment: sentimentSchema,
      }),
    },
  );
}

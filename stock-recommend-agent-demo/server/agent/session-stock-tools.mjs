import { tool } from "langchain";
import { z } from "zod";

import { searchStockNews } from "../tools/bocha-search.mjs";
import { getStockSnapshot } from "../tools/yahoo-finance.mjs";
import { normalizeCompanyOrTicker, isResolvableTicker, normalizeResolvableTicker } from "../utils/company-ticker.mjs";
import { parseMarketTicker, toDisplayTicker } from "../utils/market-ticker.mjs";
import { resolveCompanyTicker } from "../utils/resolve-company-ticker.mjs";
import {
  lookupResearchTarget,
  readResearchTargetTickers,
} from "./research-targets.mjs";
import {
  buildFindingsMarkdown,
  normalizeWorkspaceTicker,
  resolveYahooTicker,
} from "./batch-research.mjs";
import {
  findingsPath,
  marketDataPath,
  newsPath,
  readSessionMarketData,
  readSessionNews,
} from "./session-market-data.mjs";
import { writeSessionFile } from "./session-memory.mjs";

const sentimentSchema = z.object({
  label: z.enum(["bullish", "neutral", "bearish"]).describe("情绪标签"),
  confidence: z.number().min(0).max(1).describe("置信度 0-1"),
  reason: z.string().min(1).describe("中文理由"),
});

async function resolveTickerInput(input, sessionId) {
  const raw = String(input ?? "").trim();

  if (sessionId) {
    const target = lookupResearchTarget(sessionId, raw);
    if (target?.ticker) {
      return {
        ticker: target.ticker,
        companyName: target.companyName || target.name || raw,
        source: target.source ?? "research-target",
      };
    }
  }

  const domesticTicker = normalizeResolvableTicker(raw);
  if (domesticTicker && isResolvableTicker(domesticTicker)) {
    const parsed = parseMarketTicker(domesticTicker);
    if (parsed.market === "cn-a" || parsed.market === "cn-hk") {
      const displayTicker = toDisplayTicker(parsed);
      const snapshot = await getStockSnapshot(displayTicker);
      if (!snapshot.error) {
        return {
          ticker: parsed.code ?? normalizeWorkspaceTicker(displayTicker),
          companyName: snapshot.shortName ?? raw,
          source: "direct-domestic",
        };
      }
    }
  }

  const alias = normalizeCompanyOrTicker(raw);
  if (alias) {
    const snapshot = await getStockSnapshot(alias);
    if (!snapshot.error) {
      return { ticker: alias, companyName: snapshot.shortName ?? raw, source: "direct" };
    }
  }

  const resolved = await resolveCompanyTicker(raw);
  if (resolved.ticker) {
    const allowed = sessionId ? readResearchTargetTickers(sessionId) : null;
    const normalizedResolved = normalizeWorkspaceTicker(resolved.ticker);
    if (allowed?.length && !allowed.includes(normalizedResolved)) {
      const target = sessionId ? lookupResearchTarget(sessionId, raw) : null;
      if (target?.ticker) {
        return {
          ticker: target.ticker,
          companyName: target.companyName || target.name || resolved.companyName || raw,
          source: "research-target",
          resolveWarning: `解析结果 ${normalizedResolved} 不在本轮调研范围，已改用 ${target.ticker}`,
        };
      }
    }

    return {
      ticker: resolved.ticker,
      companyName: resolved.companyName ?? raw,
      source: resolved.source ?? "resolve",
    };
  }

  return {
    ticker: alias ?? normalizeWorkspaceTicker(domesticTicker) ?? raw.toUpperCase(),
    companyName: raw,
    source: "fallback",
    warning: resolved.warning,
  };
}

export function createResolveCompanyTickerTool() {
  return tool(
    async ({ companyName }) => {
      const result = await resolveCompanyTicker(companyName);
      const { candidates, ...safe } = result;
      return JSON.stringify(
        {
          ...safe,
          candidateNote:
            candidates?.length && safe.ticker
              ? "候选项仅供排查误解析，禁止对候选项发起调研"
              : undefined,
        },
        null,
        2,
      );
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
      const resolved = await resolveTickerInput(ticker, sessionId);
      const normalized = normalizeWorkspaceTicker(resolved.ticker);
      const allowed = readResearchTargetTickers(sessionId);
      if (allowed?.length && !allowed.includes(normalized)) {
        throw new Error(
          `解析结果 ${normalized} 不在本轮调研范围（${allowed.join("、")}）。请直接使用 task 中的 6 位 A 股代码调用 fetch_stock_quote。`,
        );
      }
      const snapshot = await getStockSnapshot(resolveYahooTicker(resolved.ticker));
      const payload = {
        ...snapshot,
        ticker: normalized,
        sessionTicker: normalized,
        resolvedFrom: resolved.companyName,
        resolveSource: resolved.source,
        ...(resolved.warning || resolved.resolveWarning
          ? { resolveWarning: resolved.resolveWarning ?? resolved.warning }
          : {}),
      };
      writeSessionFile(sessionId, marketDataPath(normalized), JSON.stringify(payload, null, 2));
      return JSON.stringify(payload, null, 2);
    },
    {
      name: "fetch_stock_quote",
      description:
        "获取单只股票行情快照并写入会话内存。支持公司名或 ticker；会先尝试解析 ticker 再拉行情。返回 JSON 中的 sessionTicker 字段须原样传给 save_stock_findings。",
      schema: z.object({
        ticker: z.string().min(1).describe("股票代码或公司名称，如 NVDA、SpaceX"),
      }),
    },
  );
}

export const searchNewsInputSchema = z
  .object({
    ticker: z.string().min(1).optional().describe("股票代码或公司名称"),
    companyName: z.string().min(1).optional().describe("公司名称，与 ticker 二选一"),
    theme: z.string().optional().describe("研究主题，如 AI 芯片股"),
    count: z.number().int().min(1).max(10).optional().describe("结果数量，默认 5"),
  })
  .refine((data) => Boolean(data.ticker || data.companyName), {
    message: "ticker 或 companyName 至少提供一个",
  });

export function createSessionSearchNewsTool(sessionId) {
  return tool(
    async ({ ticker, companyName, theme, count }) => {
      const input = ticker ?? companyName;
      const resolved = await resolveTickerInput(input, sessionId);
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
      description:
        "搜索单只股票近期新闻，结果写入会话内存。支持 ticker 或 companyName（至少填一个）；优先使用 fetch_stock_quote 返回的 sessionTicker。",
      schema: searchNewsInputSchema,
    },
  );
}

export function createSaveFindingsTool(sessionId) {
  return tool(
    async ({ ticker, name, sentiment }) => {
      let { storageKey, stockData, autoMatched, available } = readSessionMarketData(
        sessionId,
        ticker,
      );
      if (!stockData) {
        const target = lookupResearchTarget(sessionId, ticker);
        if (target?.ticker) {
          ({ storageKey, stockData, autoMatched, available } = readSessionMarketData(
            sessionId,
            target.ticker,
          ));
        }
      }
      if (!stockData) {
        const hint = available.length
          ? `会话中已有行情：${available.join("、")}。请使用 fetch_stock_quote 返回的 sessionTicker。`
          : "请先调用 fetch_stock_quote。";
        throw new Error(`未找到 ${normalizeWorkspaceTicker(ticker) || ticker} 行情数据，${hint}`);
      }

      const news = readSessionNews(sessionId, storageKey);
      const markdown = buildFindingsMarkdown({
        ticker: storageKey,
        name: name?.trim() || stockData.shortName || storageKey,
        news,
        sentiment,
      });
      writeSessionFile(sessionId, findingsPath(storageKey), markdown);
      const suffix = autoMatched
        ? `（已自动匹配会话中的 ${storageKey}，请后续统一使用 sessionTicker）`
        : "";
      return `已保存 ${storageKey} 调研笔记与情绪分析${suffix}`;
    },
    {
      name: "save_stock_findings",
      description:
        "将情绪分析结果写入会话内存（findings 文件）。必须在 fetch_stock_quote 与 search_stock_news 之后调用；ticker 必须使用 fetch_stock_quote 返回的 sessionTicker，禁止自行更换代码。",
      schema: z.object({
        ticker: z.string().min(1).describe("fetch_stock_quote 返回的 sessionTicker"),
        name: z.string().optional().describe("公司名称，可选"),
        sentiment: sentimentSchema,
      }),
    },
  );
}

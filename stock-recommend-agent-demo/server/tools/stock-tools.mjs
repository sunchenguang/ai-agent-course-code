import { tool } from "langchain";
import { z } from "zod";

import { searchStockNews } from "./bocha-search.mjs";
import { getStockSnapshot } from "./yahoo-finance.mjs";

export const fetchStockQuoteTool = tool(
  async ({ ticker }) => {
    const snapshot = await getStockSnapshot(ticker.toUpperCase());
    return JSON.stringify(snapshot, null, 2);
  },
  {
    name: "fetch_stock_quote",
    description:
      "获取单只股票的行情快照：价格、涨跌幅、52 周高低、PE、市值等。输入 ticker 如 NVDA。",
    schema: z.object({
      ticker: z.string().min(1).describe("股票代码，如 NVDA、AMD"),
    }),
  },
);

export const searchStockNewsTool = tool(
  async ({ ticker, companyName, theme, count }) => {
    const result = await searchStockNews({
      ticker: ticker.toUpperCase(),
      companyName,
      theme,
      count: count ?? 5,
    });
    const lines = (result.items ?? []).map(
      (item, index) =>
        `${index + 1}. ${item.title}\nURL: ${item.url}\n摘要: ${item.summary}\n来源: ${item.siteName} · ${item.publishedAt}`,
    );
    const header = result.warning ? `警告: ${result.warning}\n查询: ${result.query}\n\n` : `查询: ${result.query}\n\n`;
    return header + (lines.length ? lines.join("\n\n") : "未找到相关新闻。");
  },
  {
    name: "search_stock_news",
    description: "搜索单只股票的近期新闻。返回标题、URL、摘要。",
    schema: z.object({
      ticker: z.string().min(1).describe("股票代码"),
      companyName: z.string().optional().describe("公司名称，可选"),
      theme: z.string().optional().describe("研究主题，如 AI 芯片股"),
      count: z.number().int().min(1).max(10).optional().describe("结果数量，默认 5"),
    }),
  },
);

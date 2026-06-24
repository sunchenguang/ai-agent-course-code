import { tool } from "langchain";
import { z } from "zod";

import { callMcpTool } from "./mcp-client-pool.mjs";
import { isMcpAnalysisEnabled } from "./mcp-config.mjs";

function mcpResultToText(result) {
  return result.content?.map((item) => item.text ?? "").join("\n").trim() ?? "";
}

function createMcpBridgeTool(wrappedName, mcpToolName, description, schema) {
  return tool(
    async (args) => {
      try {
        const result = await callMcpTool(mcpToolName, args);
        return mcpResultToText(result) || JSON.stringify(result, null, 2);
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          tool: wrappedName,
        });
      }
    },
    { name: wrappedName, description, schema },
  );
}

export function createMcpAnalysisTools() {
  if (!isMcpAnalysisEnabled()) return [];

  return [
    createMcpBridgeTool(
      "mcp_analyze_stock",
      "analyze_stock",
      "MCP 深度分析：K 线指标、资金流、北向持仓、分红等全景数据。symbol 如 sh600519、00700、AAPL。",
      z.object({
        symbol: z.string().min(1).describe("股票代码"),
        market: z.enum(["A", "HK", "US"]).optional().describe("市场类型，不传则自动识别"),
        period: z.enum(["daily", "weekly", "monthly"]).optional().describe("K 线周期，默认 daily"),
      }),
    ),
    createMcpBridgeTool(
      "mcp_get_kline_with_indicators",
      "get_kline_with_indicators",
      "MCP 获取带技术指标的 K 线（MA/MACD/KDJ/RSI/BOLL）。",
      z.object({
        code: z.string().min(1).describe("股票代码，如 sh600519、AAPL"),
        period: z.enum(["daily", "weekly", "monthly"]).optional(),
        limit: z.number().int().min(10).max(120).optional().describe("K 线条数，默认 60"),
      }),
    ),
    createMcpBridgeTool(
      "mcp_get_fund_flow",
      "get_fund_flow",
      "MCP 获取个股当日资金流向（主力/散户）。",
      z.object({
        code: z.string().min(1).describe("股票代码"),
      }),
    ),
  ];
}

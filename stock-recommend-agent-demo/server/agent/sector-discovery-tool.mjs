import { tool } from "langchain";
import { z } from "zod";

import { discoverHotSectors } from "../mcp/sector-discovery.mjs";
import { writeResearchTargets } from "./research-targets.mjs";

export function createDiscoverHotSectorsTool(sessionId) {
  return tool(
    async ({ boardTypes, topSectors, stocksPerSector, maxTickers }) => {
      const normalizedBoardTypes = Array.isArray(boardTypes)
        ? boardTypes
            .map((item) => String(item ?? "").trim())
            .filter((item) => item === "industry" || item === "concept")
        : undefined;
      const result = await discoverHotSectors({
        boardTypes: normalizedBoardTypes?.length ? normalizedBoardTypes : ["industry"],
        topSectors: topSectors ?? 3,
        stocksPerSector: stocksPerSector ?? 2,
        maxTickers: maxTickers ?? 5,
      });

      writeResearchTargets(sessionId, {
        tickers: result.tickers,
        query: result.theme,
        details: result.tickerDetails ?? [],
      });

      return JSON.stringify(result, null, 2);
    },
    {
      name: "discover_hot_sectors",
      description:
        "发现 A 股当日值得关注的行业/概念板块，并从各板块选取成分股（最多 5 只）写入研究范围。需 MCP_SECTOR_ENABLED=true。用户未指定具体股票、询问热点/方向/板块时使用。",
      schema: z.object({
        boardTypes: z
          .array(z.enum(["industry", "concept"]))
          .optional()
          .describe("板块类型，默认 industry；可同时包含 concept"),
        topSectors: z.number().int().min(1).max(5).optional().describe("选取板块数量，默认 3"),
        stocksPerSector: z.number().int().min(1).max(3).optional().describe("每板块选取股票数，默认 2"),
        maxTickers: z.number().int().min(1).max(5).optional().describe("总股票上限，默认 5"),
      }),
    },
  );
}

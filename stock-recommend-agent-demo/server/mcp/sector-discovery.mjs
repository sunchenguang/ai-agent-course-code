import { callMcpTool } from "./mcp-client-pool.mjs";
import { isMcpSectorEnabled, mcpConfig } from "./mcp-config.mjs";
import {
  extractMcpDataList,
  normalizeBoardItem,
  normalizeConstituentItem,
  parseMcpToolJson,
} from "./mcp-board-parse.mjs";
import { parseMarketTicker, toDisplayTicker } from "../utils/market-ticker.mjs";

const DEFAULT_EXCLUDE_BOARD =
  /昨日|连板|打板|破净|含可转债|ST板块|退市|涨停|跌停|昨日触板|昨日涨停/i;

const BOARD_TOOL = {
  industry: {
    list: "get_industry_list",
    constituents: "get_industry_constituents",
    label: "行业",
  },
  concept: {
    list: "get_concept_list",
    constituents: "get_concept_constituents",
    label: "概念",
  },
};

async function callMcpJson(toolName, args = {}) {
  const result = await callMcpTool(toolName, args, { timeoutMs: mcpConfig.sectorTimeoutMs });
  const text = result.content?.map((item) => item.text ?? "").join("\n").trim();
  return parseMcpToolJson(text);
}

export function filterBoards(boards, { excludePattern = DEFAULT_EXCLUDE_BOARD } = {}) {
  return boards.filter((board) => {
    if (!board.name) return false;
    if (excludePattern.test(board.name)) return false;
    if (board.changePercent == null) return false;
    if ((board.riseCount ?? 0) <= 0) return false;
    return true;
  });
}

export function rankBoards(boards) {
  return [...boards].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
}

export function pickConstituentTickers(constituents, limit = 2) {
  const ranked = [...constituents]
    .filter((item) => /^\d{6}$/.test(item.code))
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));

  const tickers = [];
  const seen = new Set();
  for (const item of ranked) {
    const parsed = parseMarketTicker(item.code);
    const display = toDisplayTicker(parsed);
    const key = parsed.code ?? item.code;
    if (seen.has(key)) continue;
    seen.add(key);
    tickers.push({
      ticker: display,
      name: item.name,
      changePercent: item.changePercent,
    });
    if (tickers.length >= limit) break;
  }
  return tickers;
}

export async function fetchBoardList(boardType = "industry") {
  const config = BOARD_TOOL[boardType];
  if (!config) {
    throw new Error(`Unsupported board type: ${boardType}`);
  }
  const payload = await callMcpJson(config.list);
  return extractMcpDataList(payload).map(normalizeBoardItem);
}

export async function fetchBoardConstituents(boardType, symbol) {
  const config = BOARD_TOOL[boardType];
  const payload = await callMcpJson(config.constituents, { symbol });
  return extractMcpDataList(payload).map(normalizeConstituentItem);
}

export async function discoverHotSectors({
  boardTypes = ["industry"],
  topSectors = 3,
  stocksPerSector = 2,
  maxTickers = 5,
  excludePattern = DEFAULT_EXCLUDE_BOARD,
} = {}) {
  if (!isMcpSectorEnabled()) {
    throw new Error("未启用 MCP_SECTOR_ENABLED，无法执行板块发现。请在 .env 中设置 MCP_SECTOR_ENABLED=true");
  }

  const mergedBoards = [];
  for (const boardType of boardTypes) {
    const boards = await fetchBoardList(boardType);
    for (const board of filterBoards(boards, { excludePattern })) {
      mergedBoards.push({ ...board, boardType, boardTypeLabel: BOARD_TOOL[boardType].label });
    }
  }

  const rankedBoards = rankBoards(mergedBoards).slice(0, topSectors);
  if (!rankedBoards.length) {
    throw new Error("未找到符合条件的 A 股板块");
  }

  const sectors = [];
  const tickerEntries = [];
  const seenTickers = new Set();

  for (const board of rankedBoards) {
    const constituents = await fetchBoardConstituents(board.boardType, board.name || board.code);
    const picks = pickConstituentTickers(constituents, stocksPerSector);
    const stocks = [];

    for (const pick of picks) {
      const normalized = pick.ticker.replace(/\.(SS|SZ|SH)$/i, "");
      if (seenTickers.has(normalized)) continue;
      if (tickerEntries.length >= maxTickers) break;

      seenTickers.add(normalized);
      tickerEntries.push({
        ticker: pick.ticker,
        name: pick.name,
        sectorName: board.name,
        sectorCode: board.code,
        boardType: board.boardType,
        changePercent: pick.changePercent,
      });
      stocks.push(pick);
    }

    sectors.push({
      name: board.name,
      code: board.code,
      boardType: board.boardType,
      boardTypeLabel: board.boardTypeLabel,
      changePercent: board.changePercent,
      turnoverRate: board.turnoverRate,
      leadingStock: board.leadingStock,
      leadingStockChangePercent: board.leadingStockChangePercent,
      stocks,
    });

    if (tickerEntries.length >= maxTickers) break;
  }

  if (!tickerEntries.length) {
    throw new Error("板块成分股解析失败，未得到可调研股票");
  }

  return {
    boardTypes,
    topSectors: sectors.length,
    sectors,
    tickers: tickerEntries.map((item) => item.ticker),
    tickerDetails: tickerEntries,
    theme: sectors.map((item) => item.name).join("、"),
    disclaimer:
      "板块按当日涨跌幅排序，仅代表市场热点快照，不构成投资建议；热点板块波动大，请谨慎参考。",
  };
}

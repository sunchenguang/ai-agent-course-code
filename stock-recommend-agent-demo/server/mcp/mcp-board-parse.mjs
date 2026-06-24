export function parseMcpToolJson(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    throw new Error("MCP response empty");
  }
  return JSON.parse(raw);
}

export function extractMcpDataList(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function pickNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeBoardItem(item = {}) {
  return {
    rank: pickNumber(item.rank),
    name: String(item.name ?? item.symbol ?? "").trim(),
    code: String(item.code ?? item.symbol ?? "").trim(),
    changePercent: pickNumber(item.changePercent ?? item.pctChg ?? item.change_pct),
    turnoverRate: pickNumber(item.turnoverRate),
    riseCount: pickNumber(item.riseCount),
    fallCount: pickNumber(item.fallCount),
    leadingStock: String(item.leadingStock ?? "").trim(),
    leadingStockChangePercent: pickNumber(item.leadingStockChangePercent),
  };
}

export function normalizeConstituentItem(item = {}) {
  const code = String(item.code ?? item.symbol ?? "")
    .replace(/^(sh|sz|bj)/i, "")
    .replace(/\D/g, "")
    .padStart(6, "0");

  return {
    rank: pickNumber(item.rank),
    code,
    name: String(item.name ?? "").trim(),
    changePercent: pickNumber(item.changePercent ?? item.pctChg),
    turnoverRate: pickNumber(item.turnoverRate),
    pe: pickNumber(item.pe),
  };
}

import { createChatModel } from "../utils/llm.mjs";
import { scoreFundCandidates } from "../utils/fund-scoring.mjs";
import { callMcpTool } from "../mcp/mcp-client-pool.mjs";

function extractTextFromMcpResult(result) {
  return result?.content?.map((item) => item.text ?? "").join("\n").trim() ?? "";
}

function parseMcpJson(result) {
  const text = extractTextFromMcpResult(result);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function detectEtfCode(code) {
  const raw = String(code ?? "").trim().toUpperCase();
  return /^(?:1|5)\d{5}$/.test(raw);
}

function buildCandidatesFromCodes(codes = []) {
  const uniqueCodes = [...new Set(codes.map((item) => String(item ?? "").trim()).filter(Boolean))].slice(0, 40);
  return uniqueCodes.map((code) => ({
    code,
    name: code,
    ticker: code,
    isEtf: detectEtfCode(code),
  }));
}

async function enrichWithFundQuotes(candidates) {
  const codes = candidates.map((item) => item.code).slice(0, 20);
  if (!codes.length) return candidates;

  const result = await callMcpTool("get_fund_quotes", { codes });
  const data = parseMcpJson(result);
  if (!data) return candidates.map((item) => ({ ...item, quote: { error: "基金行情返回非 JSON" } }));

  const quoteList = Array.isArray(data) ? data : data.data ?? data.results ?? [];
  const quoteMap = new Map();
  for (const quote of quoteList) {
    const key = String(quote.code ?? quote.fundCode ?? quote.symbol ?? "").trim();
    if (key) quoteMap.set(key, quote);
  }

  return candidates.map((candidate) => ({
    ...candidate,
    quote: quoteMap.get(candidate.code) ?? { error: "未匹配到基金行情" },
  }));
}

async function getFundCodeCandidates(theme, tickers = []) {
  const query = `${theme ?? ""} ${tickers.join(" ")}`.trim();
  const codeResult = await callMcpTool("get_fund_code_list", {});
  const payload = parseMcpJson(codeResult);
  const rawCodes = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.codes)
      ? payload.codes
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  const codes = rawCodes
    .map((item) => (typeof item === "string" ? item : item?.code ?? item?.fundCode ?? ""))
    .filter(Boolean);

  if (!codes.length) {
    return buildCandidatesFromCodes(tickers);
  }

  const keyword = query.toUpperCase();
  const preferred = codes.filter((code) => {
    const normalized = String(code).toUpperCase();
    if (/ETF/.test(keyword) && !/^(?:1|5)\d{5}$/.test(normalized)) return false;
    if (/黄金|贵金属/.test(keyword)) return /AU|黄金|518|1599/.test(normalized);
    if (/科技|半导体|芯片/.test(keyword)) return /科技|芯片|半导体|科技/.test(normalized);
    if (/红利|高股息/.test(keyword)) return /红利|股息|515|561/.test(normalized);
    if (/宽基|大盘|指数/.test(keyword)) return /510|300|50|100|500|1000/.test(normalized);
    return true;
  });

  return buildCandidatesFromCodes((preferred.length ? preferred : codes).slice(0, 20));
}

export async function runFundRecommendationStream(input, { send } = {}) {
  const theme = String(input?.theme ?? "ETF / 基金收益优先推荐").trim() || "ETF / 基金收益优先推荐";
  const tickers = Array.isArray(input?.tickers) ? input.tickers : [];

  send?.("progress", { step: "normalize_input", status: "running" });
  const candidates = await getFundCodeCandidates(theme, tickers);
  send?.("progress", { step: "normalize_input", status: "completed" });
  send?.("metadata", { tickers: candidates.map((item) => item.code), theme });

  send?.("progress", { step: "fetch_fund_data", status: "running" });
  const enriched = await enrichWithFundQuotes(candidates);
  send?.("progress", { step: "fetch_fund_data", status: "completed" });

  send?.("progress", { step: "score_funds", status: "running" });
  const ranking = scoreFundCandidates(enriched);
  send?.("ranking", { ranking, theme });
  send?.("progress", { step: "score_funds", status: "completed" });

  send?.("progress", { step: "generate_report", status: "running" });
  const reportMarkdown = fallbackFundReport({ theme, ranking });
  send?.("report_delta", reportMarkdown);
  send?.("progress", { step: "generate_report", status: "completed" });
  send?.("done", { tickers: ranking.map((item) => item.code), theme, ranking, reportMarkdown, errors: [] });

  return { tickers: ranking.map((item) => item.code), theme, ranking, reportMarkdown, errors: [] };
}

function formatPrice(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(4) : "未知";
}

function fallbackFundReport(state) {
  const lines = [
    `# ${state.theme}`,
    "",
    "> 免责声明：本 Demo 仅用于技术演示，不构成任何投资建议。",
    "",
    "## 筛选逻辑",
    "",
    "- 主要目标：收益优先",
    "- 约束条件：基础风险过滤、数据完整性检查",
    "- 评分侧重：收益表现 > 风险控制 > 数据完整度",
    "",
    "## 推荐结论",
    "",
  ];

  for (const item of state.ranking.slice(0, 5)) {
    const latestNetValue = formatPrice(item.quote?.nav ?? item.quote?.price ?? item.quote?.latestPrice);
    const dailyChange = Number.isFinite(Number(item.quote?.changePercent))
      ? `${Number(item.quote.changePercent).toFixed(2)}%`
      : "未知";
    const recommendationReason = [
      item.isEtf ? "ETF/基金标的明确" : "标的类型待确认",
      `收益评分 ${item.factors.returnScore}`,
      `风控评分 ${item.factors.riskControl}`,
    ].join("，");

    lines.push(
      `### ${item.code} - ${item.rating}（${item.score}/100）`,
      "",
      `- 名称：${item.name ?? item.code}`,
      `- 最新净值：${latestNetValue}`,
      `- 日内表现：${dailyChange}`,
      `- 推荐理由：${recommendationReason}`,
      `- 评分拆解：收益 ${item.factors.returnScore} / 风控 ${item.factors.riskControl} / 完整度 ${item.factors.completeness}`,
      `- 主要风险：${item.riskFlags.length ? item.riskFlags.join("；") : "未发现明显风险信号"}`,
      "",
    );
  }

  lines.push(
    "## 备注",
    "",
    "- 当前版本使用基金代码池与实时净值做 MVP 推荐，适合作为候选筛选与演示。",
    "- 若后续补齐历史收益、回撤、费率与规模数据，可进一步提升 ranking 质量。",
  );

  return lines.join("\n");
}

export async function generateFundReportMarkdown(state) {
  return fallbackFundReport(state);
}

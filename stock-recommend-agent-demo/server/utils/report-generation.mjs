import { createChatModel, extractText } from "./llm.mjs";

function formatMoney(value, currency = "USD") {
  if (!Number.isFinite(Number(value))) return "未知";
  return `${Number(value).toFixed(2)} ${currency}`;
}

export function fallbackReport(state) {
  const lines = [
    `# ${state.theme}：AI 股票推荐研报`,
    "",
    "> 免责声明：本 Demo 仅用于技术演示，不构成任何投资建议。",
    "",
    "## 推荐结论",
    "",
  ];

  for (const item of state.ranking) {
    lines.push(
      `### ${item.ticker} - ${item.rating}（${item.score}/100）`,
      "",
      `- 公司：${item.name ?? item.ticker}`,
      `- 当前价格：${formatMoney(item.stockData?.regularMarketPrice, item.stockData?.currency)}`,
      `- 日内涨跌幅：${
        Number.isFinite(Number(item.stockData?.regularMarketChangePercent))
          ? `${Number(item.stockData.regularMarketChangePercent).toFixed(2)}%`
          : "未知"
      }`,
      `- 新闻情绪：${item.sentiment?.label ?? "neutral"}，${item.sentiment?.reason ?? "暂无解释"}`,
      `- 评分拆解：动量 ${item.factors.momentum} / 基本面 ${item.factors.fundamentals} / 情绪 ${item.factors.sentiment} / 风控 ${item.factors.riskControl}`,
      `- 主要风险：${item.riskFlags.length ? item.riskFlags.join("；") : "未发现明显风险信号"}`,
      "",
    );
  }

  if (state.errors?.length) {
    lines.push("## 数据缺口", "", ...state.errors.map((error) => `- ${error}`), "");
  }

  return lines.join("\n");
}

function compactRanking(ranking) {
  return ranking.map((item) => ({
    ticker: item.ticker,
    name: item.name,
    score: item.score,
    rating: item.rating,
    factors: item.factors,
    sentiment: item.sentiment,
    riskFlags: item.riskFlags,
    stockData: item.stockData,
    news: (item.news?.items ?? []).slice(0, 3),
  }));
}

function buildReportPrompt(state) {
  return `你是一个谨慎但有观点的 AI 股票推荐研究员。请基于给定结构化数据生成中文 Markdown 研报。

要求：
1. 给出 Top 推荐结论，体现“推荐股票 Agent”的演示效果。
2. 解释推荐分，不要声称确定收益。
3. 每只股票列出推荐理由、风险点、后续关注事项。
4. 必须包含免责声明：仅用于技术演示，不构成投资建议。
5. 不要编造输入数据之外的价格、新闻或财务指标。

主题：${state.theme}
候选结果 JSON：
${JSON.stringify(compactRanking(state.ranking), null, 2)}

数据缺口：
${(state.errors ?? []).join("\n") || "无"}`;
}

async function* streamTextChunks(text, chunkSize = 120) {
  for (let index = 0; index < text.length; index += chunkSize) {
    yield text.slice(index, index + chunkSize);
  }
}

export async function* streamReportMarkdown(state, { model = createChatModel({ temperature: 0.3 }) } = {}) {
  if (!model) {
    yield* streamTextChunks(fallbackReport(state));
    return;
  }

  try {
    if (typeof model.stream === "function") {
      for await (const chunk of await model.stream(buildReportPrompt(state))) {
        const text = extractText(chunk);
        if (text) yield text;
      }
      return;
    }

    const response = await model.invoke(buildReportPrompt(state));
    const text = extractText(response);
    yield* streamTextChunks(text || fallbackReport(state));
  } catch (error) {
    yield* streamTextChunks(
      fallbackReport({
        ...state,
        errors: [
          ...(state.errors ?? []),
          `LLM 研报生成失败，已使用本地模板：${error instanceof Error ? error.message : String(error)}`,
        ],
      }),
    );
  }
}

export async function generateReportMarkdown(state, options) {
  const chunks = [];
  for await (const chunk of streamReportMarkdown(state, options)) {
    chunks.push(chunk);
  }
  return chunks.join("");
}

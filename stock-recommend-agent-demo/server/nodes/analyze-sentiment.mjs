import { createChatModel, extractText, parseJsonObject } from "../utils/llm.mjs";

const POSITIVE_WORDS = ["growth", "beat", "record", "surge", "strong", "upgrade", "partnership", "demand"];
const NEGATIVE_WORDS = ["drop", "miss", "lawsuit", "probe", "downgrade", "weak", "risk", "delay", "cut"];

function heuristicSentiment(candidate) {
  const text = (candidate.news?.items ?? [])
    .map((item) => `${item.title} ${item.summary}`)
    .join(" ")
    .toLowerCase();

  const positive = POSITIVE_WORDS.filter((word) => text.includes(word)).length;
  const negative = NEGATIVE_WORDS.filter((word) => text.includes(word)).length;

  if (positive > negative) {
    return {
      label: "bullish",
      confidence: 0.62,
      reason: "新闻摘要中正面增长、需求或上调相关信号更多。",
    };
  }
  if (negative > positive) {
    return {
      label: "bearish",
      confidence: 0.62,
      reason: "新闻摘要中风险、下调或疲弱相关信号更多。",
    };
  }
  return {
    label: "neutral",
    confidence: 0.5,
    reason: "新闻信号不够集中，暂按中性处理。",
  };
}

async function analyzeWithModel(model, candidate) {
  const newsText = (candidate.news?.items ?? [])
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}\n${item.summary}\n${item.url}`)
    .join("\n\n");

  const response = await model.invoke(`你是股票新闻情绪分析助手。请只返回 JSON，不要返回 Markdown。

股票：${candidate.ticker}
公司：${candidate.name}
近期新闻：
${newsText || "没有搜索到近期新闻。"}

返回格式：
{
  "label": "bullish | neutral | bearish",
  "confidence": 0.0到1.0,
  "reason": "一句中文解释"
}`);

  const parsed = parseJsonObject(extractText(response));
  if (!["bullish", "neutral", "bearish"].includes(parsed.label)) {
    throw new Error("LLM returned invalid sentiment label");
  }
  return {
    label: parsed.label,
    confidence: Number(parsed.confidence) || 0.5,
    reason: String(parsed.reason ?? "未提供解释"),
  };
}

export async function analyzeSentimentCandidates(inputCandidates, model, inputErrors = []) {
  const errors = [...inputErrors];
  const candidates = await Promise.all(
    inputCandidates.map(async (candidate) => {
    let sentiment;
    try {
      sentiment = model ? await analyzeWithModel(model, candidate) : heuristicSentiment(candidate);
    } catch (error) {
      sentiment = heuristicSentiment(candidate);
      errors.push(
        `${candidate.ticker}: LLM 情绪分析失败，已使用本地启发式分析 - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

      return { ...candidate, sentiment };
    }),
  );

  return { candidates, errors };
}

export async function analyzeSentimentNode(state) {
  const model = createChatModel({ temperature: 0 });
  return analyzeSentimentCandidates(state.candidates, model, state.errors ?? []);
}

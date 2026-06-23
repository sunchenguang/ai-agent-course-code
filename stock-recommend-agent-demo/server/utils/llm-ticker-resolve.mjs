import { createChatModel, extractText, parseJsonObject } from "./llm.mjs";
import { parseMarketTicker, toDisplayTicker } from "./market-ticker.mjs";

function normalizeLlmTicker(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value.toLowerCase() === "null") return null;

  const parsed = parseMarketTicker(value);
  if (parsed.market === "cn-a" || parsed.market === "cn-hk") {
    return toDisplayTicker(parsed);
  }

  const upper = value.toUpperCase();
  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(upper)) {
    return upper;
  }

  return null;
}

export async function resolveTickerViaLlm(
  companyName,
  { modelFactory = createChatModel } = {},
) {
  const query = String(companyName ?? "").trim();
  if (!query) {
    return { ticker: null, warning: "公司名为空" };
  }

  const model = modelFactory({ temperature: 0 });
  if (!model) {
    return { ticker: null, warning: "未配置 OPENAI_API_KEY，无法使用 LLM 解析股票代码" };
  }

  const prompt = `你是股票代码解析助手。根据用户给出的公司名称或简称，返回其在主要交易所的可交易代码。

规则：
- A股上海：6位代码 + .SS，例如 600519.SS（贵州茅台）
- A股深圳：6位代码 + .SZ，例如 000001.SZ、300750.SZ
- 港股：4-5位代码 + .HK，例如 0700.HK（腾讯控股）
- 美股：字母代码，例如 NVDA、AAPL
- 若公司未上市、已退市或无法确定唯一代码，ticker 填 null，并在 reason 中简要说明
- 只返回 JSON，不要 markdown 解释

用户输入：${query}

返回 JSON 示例：
{"ticker":"600519.SS","companyName":"贵州茅台","market":"cn-a","confidence":"high","reason":""}`;

  try {
    const response = await model.invoke(prompt);
    const parsed = parseJsonObject(extractText(response));
    const ticker = normalizeLlmTicker(parsed.ticker);

    if (!ticker) {
      return {
        ticker: null,
        warning: parsed.reason?.trim() || "LLM 未能识别有效股票代码",
        llmResponse: parsed,
      };
    }

    return {
      ticker,
      companyName: String(parsed.companyName ?? query).trim() || query,
      market: parsed.market ?? parseMarketTicker(ticker).market,
      confidence: parsed.confidence ?? "medium",
      reason: parsed.reason?.trim() ?? "",
      source: "llm",
    };
  } catch (error) {
    return {
      ticker: null,
      warning: `LLM 解析失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

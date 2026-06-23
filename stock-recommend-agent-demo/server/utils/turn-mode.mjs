import { extractCompanyNameCandidates, extractTickersFromText } from "./company-ticker.mjs";

const RESEARCH_INTENT_PATTERN =
  /(?:调研|研究|分析|看看|查一下|对比一下|对比|评估|帮我看|帮我查|重新分析|再看|推荐排序)/u;

const CLARIFICATION_PATTERN =
  /(?:是什么|怎么样|如何|为什么|多少|建议|风险|能买|要不要|可以吗|意味着什么|各自|前三|排名|解释|说明一下)/u;

export function hasResearchIntent(text) {
  return RESEARCH_INTENT_PATTERN.test(String(text ?? "").trim());
}

export function targetsOverlapExistingResearch(text, existingRanking) {
  const existingTickers = new Set(
    (existingRanking?.ranking ?? []).map((item) => String(item.ticker ?? "").toUpperCase()),
  );
  const companyNames = extractCompanyNameCandidates(text, [...existingTickers]);

  if (companyNames.length > 0) return false;

  const requestedTickers = extractTickersFromText(text).map((ticker) => ticker.toUpperCase());
  if (!requestedTickers.length) return false;

  return requestedTickers.every((ticker) => existingTickers.has(ticker));
}

export function isClarificationQuestion(text, existingTickers = new Set()) {
  const raw = String(text ?? "").trim();
  if (!raw) return true;
  if (hasResearchIntent(raw)) return false;

  if (!CLARIFICATION_PATTERN.test(raw)) return false;

  const tickers = extractTickersFromText(raw).map((ticker) => ticker.toUpperCase());
  if (!tickers.length) return true;
  return tickers.every((ticker) => existingTickers.has(ticker));
}

export function isFollowUpTurn({ messages, resetWorkspace, sessionId, readRanking }) {
  if (resetWorkspace) return false;

  const userCount = messages.filter((msg) => msg.role === "user").length;
  if (userCount <= 1) return false;

  const existingRanking = readRanking(sessionId);
  if (!existingRanking?.ranking?.length) return false;

  const lastUserMessage = [...messages].reverse().find((msg) => msg.role === "user")?.content ?? "";
  const existingTickers = new Set(
    (existingRanking.ranking ?? []).map((item) => String(item.ticker ?? "").toUpperCase()),
  );

  if (hasResearchIntent(lastUserMessage)) {
    return false;
  }

  return isClarificationQuestion(lastUserMessage, existingTickers);
}

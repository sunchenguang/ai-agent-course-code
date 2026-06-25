import { analyzeSentimentNode } from "./nodes/analyze-sentiment.mjs";
import { fetchStockDataNode } from "./nodes/fetch-stock-data.mjs";
import { normalizeInputNode } from "./nodes/normalize-input.mjs";
import { scoreStocksNode } from "./nodes/score-stocks.mjs";
import { buildCandidatesNode, searchNewsNode } from "./nodes/search-news.mjs";
import { streamReportMarkdown } from "./utils/report-generation.mjs";
import { runFundRecommendationStream } from "./nodes/fund-recommendation.mjs";

const defaultNodes = {
  normalizeInputNode,
  fetchStockDataNode,
  searchNewsNode,
  buildCandidatesNode,
  analyzeSentimentNode,
  scoreStocksNode,
};

function publicResult(state) {
  return {
    tickers: state.tickers,
    theme: state.theme,
    ranking: state.ranking,
    reportMarkdown: state.reportMarkdown,
    errors: state.errors,
  };
}

async function applyStep({ id, node }, state, send) {
  send("progress", { step: id, status: "running" });
  const update = await node(state);
  const nextState = { ...state, ...update };
  send("progress", { step: id, status: "completed" });
  return nextState;
}

function isFundRecommendationInput(input) {
  const text = `${input?.theme ?? ""} ${Array.isArray(input?.tickers) ? input.tickers.join(" ") : ""} ${input?.tickerText ?? ""}`;
  return /基金|ETF|etf|公募|指数基金|宽基|行业基金|主题基金|收益优先|基金排名|基金推荐|基金排行/i.test(text);
}

export async function runRecommendationStream(
  input,
  { send, nodes = defaultNodes, reportStreamer = streamReportMarkdown, fundRunner = runFundRecommendationStream } = {},
) {
  if (isFundRecommendationInput(input)) {
    return fundRunner(input, { send });
  }

  let state = {
    tickers: input.tickers,
    tickerText: input.tickerText,
    theme: input.theme,
    errors: [],
  };

  state = await applyStep({ id: "normalize_input", node: nodes.normalizeInputNode }, state, send);
  send("metadata", { tickers: state.tickers, theme: state.theme });

  const steps = [
    { id: "fetch_stock_data", node: nodes.fetchStockDataNode },
    { id: "search_recent_news", node: nodes.searchNewsNode },
    { id: "build_candidates", node: nodes.buildCandidatesNode },
    { id: "analyze_sentiment", node: nodes.analyzeSentimentNode },
    { id: "score_stocks", node: nodes.scoreStocksNode },
  ];

  for (const step of steps) {
    state = await applyStep(step, state, send);
    if (step.id === "score_stocks") {
      send("ranking", { ranking: state.ranking, errors: state.errors });
    }
  }

  send("progress", { step: "generate_report", status: "running" });
  let reportMarkdown = "";
  for await (const chunk of reportStreamer(state)) {
    reportMarkdown += chunk;
    send("report_delta", chunk);
  }

  state = { ...state, reportMarkdown };
  send("progress", { step: "generate_report", status: "completed" });
  send("done", publicResult(state));
  return publicResult(state);
}

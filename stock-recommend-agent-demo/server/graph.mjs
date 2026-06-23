import { END, START, StateGraph } from "@langchain/langgraph";

import { GraphState } from "./state.mjs";
import { analyzeSentimentNode } from "./nodes/analyze-sentiment.mjs";
import { fetchStockDataNode } from "./nodes/fetch-stock-data.mjs";
import { generateReportNode } from "./nodes/generate-report.mjs";
import { normalizeInputNode } from "./nodes/normalize-input.mjs";
import { scoreStocksNode } from "./nodes/score-stocks.mjs";
import { buildCandidatesNode, searchNewsNode } from "./nodes/search-news.mjs";

export const recommendationGraph = new StateGraph(GraphState)
  .addNode("normalize_input", normalizeInputNode)
  .addNode("fetch_stock_data", fetchStockDataNode)
  .addNode("search_recent_news", searchNewsNode)
  .addNode("build_candidates", buildCandidatesNode)
  .addNode("analyze_sentiment", analyzeSentimentNode)
  .addNode("score_stocks", scoreStocksNode)
  .addNode("generate_report", generateReportNode)
  .addEdge(START, "normalize_input")
  .addEdge("normalize_input", "fetch_stock_data")
  .addEdge("fetch_stock_data", "search_recent_news")
  .addEdge("search_recent_news", "build_candidates")
  .addEdge("build_candidates", "analyze_sentiment")
  .addEdge("analyze_sentiment", "score_stocks")
  .addEdge("score_stocks", "generate_report")
  .addEdge("generate_report", END)
  .compile();

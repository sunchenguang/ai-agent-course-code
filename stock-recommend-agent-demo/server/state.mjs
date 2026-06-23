import { Annotation } from "@langchain/langgraph";

const replace = (_prev, next) => next;

export const GraphState = Annotation.Root({
  tickers: Annotation({ reducer: replace, default: () => [] }),
  tickerText: Annotation({ reducer: replace, default: () => "" }),
  theme: Annotation({ reducer: replace, default: () => "AI 股票推荐" }),
  stocks: Annotation({ reducer: replace, default: () => [] }),
  newsResults: Annotation({ reducer: replace, default: () => [] }),
  candidates: Annotation({ reducer: replace, default: () => [] }),
  ranking: Annotation({ reducer: replace, default: () => [] }),
  reportMarkdown: Annotation({ reducer: replace, default: () => "" }),
  errors: Annotation({ reducer: replace, default: () => [] }),
});

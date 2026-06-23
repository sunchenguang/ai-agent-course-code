import assert from "node:assert/strict";
import test from "node:test";

import { runRecommendationStream } from "../recommendation-stream.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("emits progress, ranking, markdown deltas, and final result", async () => {
  const events = [];
  const nodes = {
    normalizeInputNode: async () => ({ tickers: ["NVDA"], tickerText: "NVDA", theme: "AI 芯片股", errors: [] }),
    fetchStockDataNode: async () => ({ stocks: [{ ticker: "NVDA" }], errors: [] }),
    searchNewsNode: async () => ({ newsResults: [{ ticker: "NVDA", items: [] }] }),
    buildCandidatesNode: async () => ({ candidates: [{ ticker: "NVDA" }], errors: [] }),
    analyzeSentimentNode: async () => ({ candidates: [{ ticker: "NVDA", sentiment: { label: "bullish" } }], errors: [] }),
    scoreStocksNode: async () => ({ ranking: [{ ticker: "NVDA", score: 88 }] }),
  };

  await runRecommendationStream(
    { tickerText: "NVDA", theme: "AI 芯片股" },
    {
      nodes,
      reportStreamer: async function* () {
        yield "# 标题\n";
        yield "正文";
      },
      send: (event, payload) => events.push({ event, payload }),
    },
  );

  assert.deepEqual(
    events.filter((item) => item.event === "ranking").map((item) => item.payload.ranking),
    [[{ ticker: "NVDA", score: 88 }]],
  );
  assert.deepEqual(
    events.filter((item) => item.event === "report_delta").map((item) => item.payload),
    ["# 标题\n", "正文"],
  );
  assert.deepEqual(events.at(-1), {
    event: "done",
    payload: {
      tickers: ["NVDA"],
      theme: "AI 芯片股",
      ranking: [{ ticker: "NVDA", score: 88 }],
      reportMarkdown: "# 标题\n正文",
      errors: [],
    },
  });
});

test("searches recent news after stock data fetch so company names are available", async () => {
  const order = [];
  const nodes = {
    normalizeInputNode: async () => ({ tickers: ["NVDA"], tickerText: "NVDA", theme: "AI 芯片股", errors: [] }),
    fetchStockDataNode: async () => {
      order.push("fetch:start");
      await sleep(30);
      order.push("fetch:end");
      return { stocks: [{ ticker: "NVDA", shortName: "NVIDIA Corporation" }], errors: [] };
    },
    searchNewsNode: async (state) => {
      order.push("search:start");
      assert.deepEqual(state.stocks, [{ ticker: "NVDA", shortName: "NVIDIA Corporation" }]);
      await sleep(5);
      order.push("search:end");
      return { newsResults: [{ ticker: "NVDA", items: [] }] };
    },
    buildCandidatesNode: async () => ({ candidates: [{ ticker: "NVDA" }], errors: [] }),
    analyzeSentimentNode: async () => ({ candidates: [{ ticker: "NVDA", sentiment: { label: "bullish" } }], errors: [] }),
    scoreStocksNode: async () => ({ ranking: [{ ticker: "NVDA", score: 88 }] }),
  };

  await runRecommendationStream(
    { tickerText: "NVDA", theme: "AI 芯片股" },
    {
      nodes,
      reportStreamer: async function* () {},
      send: () => {},
    },
  );

  assert.ok(order.indexOf("fetch:end") < order.indexOf("search:start"));
});

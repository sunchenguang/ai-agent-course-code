import assert from "node:assert/strict";
import test from "node:test";

import { runRecommendationStream } from "../recommendation-stream.mjs";

function collectEvents() {
  const events = [];
  return {
    events,
    send: (event, payload) => events.push({ event, payload }),
  };
}

test("routes fund and ETF requests into the fund recommendation stream", async () => {
  const { events, send } = collectEvents();

  await runRecommendationStream(
    { tickerText: "推荐收益高的 ETF", theme: "ETF 收益优先推荐" },
    {
      send,
    },
  );

  const stepEvents = events.filter((item) => item.event === "progress").map((item) => item.payload.step);
  assert.deepEqual(stepEvents, ["normalize_input", "fetch_fund_data", "score_funds", "generate_report"]);

  const rankingEvent = events.find((item) => item.event === "ranking");
  assert.ok(rankingEvent);
  assert.equal(rankingEvent.payload.theme, "ETF 收益优先推荐");
  assert.ok(Array.isArray(rankingEvent.payload.ranking));
  assert.ok(rankingEvent.payload.ranking.length > 0);

  const doneEvent = events.at(-1);
  assert.equal(doneEvent.event, "done");
  assert.equal(doneEvent.payload.theme, "ETF 收益优先推荐");
  assert.ok(doneEvent.payload.reportMarkdown.includes("免责声明"));
});

test("keeps stock recommendation flow for non fund requests", async () => {
  const { events, send } = collectEvents();
  const nodes = {
    normalizeInputNode: async () => ({ tickers: ["NVDA"], tickerText: "NVDA", theme: "AI 芯片股", errors: [] }),
    fetchStockDataNode: async () => ({ stocks: [{ ticker: "NVDA" }], errors: [] }),
    searchNewsNode: async () => ({ newsResults: [{ ticker: "NVDA", items: [] }] }),
    buildCandidatesNode: async () => ({ candidates: [{ ticker: "NVDA" }], errors: [] }),
    analyzeSentimentNode: async () => ({ candidates: [{ ticker: "NVDA", sentiment: { label: "bullish" } }], errors: [] }),
    scoreStocksNode: async () => ({ ranking: [{ ticker: "NVDA", score: 90 }] }),
  };

  await runRecommendationStream(
    { tickerText: "NVDA", theme: "AI 芯片股" },
    {
      nodes,
      reportStreamer: async function* () {
        yield "# 报告";
      },
      send,
    },
  );

  const rankingEvent = events.find((item) => item.event === "ranking");
  assert.deepEqual(rankingEvent.payload.ranking, [{ ticker: "NVDA", score: 90 }]);
  const reportEvent = events.find((item) => item.event === "report_delta");
  assert.equal(reportEvent.payload, "# 报告");
});

test("fund recommendation stream can be injected for deterministic tests", async () => {
  const { events, send } = collectEvents();
  const fakeFundRunner = async (_input, { send: innerSend }) => {
    innerSend("progress", { step: "normalize_input", status: "running" });
    innerSend("ranking", { ranking: [{ code: "510300", score: 88 }], theme: "ETF 收益优先推荐" });
    innerSend("report_delta", "# ETF 报告\n");
    innerSend("done", {
      tickers: ["510300"],
      theme: "ETF 收益优先推荐",
      ranking: [{ code: "510300", score: 88 }],
      reportMarkdown: "# ETF 报告\n",
      errors: [],
    });
    return {
      tickers: ["510300"],
      theme: "ETF 收益优先推荐",
      ranking: [{ code: "510300", score: 88 }],
      reportMarkdown: "# ETF 报告\n",
      errors: [],
    };
  };

  await runRecommendationStream(
    { tickerText: "ETF ranking", theme: "ETF 收益优先推荐" },
    {
      send,
      fundRunner: fakeFundRunner,
    },
  );

  const rankingEvent = events.find((item) => item.event === "ranking");
  assert.equal(rankingEvent.payload.ranking[0].code, "510300");
  const reportEvent = events.find((item) => item.event === "report_delta");
  assert.equal(reportEvent.payload, "# ETF 报告\n");
});

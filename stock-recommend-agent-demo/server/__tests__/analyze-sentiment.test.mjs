import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSentimentCandidates } from "../nodes/analyze-sentiment.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("analyzes candidate sentiment concurrently when a model is available", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const model = {
    async invoke() {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(10);
      inFlight -= 1;
      return { content: '{"label":"bullish","confidence":0.8,"reason":"新闻偏正面"}' };
    },
  };

  const candidates = ["NVDA", "AMD", "TSM"].map((ticker) => ({
    ticker,
    name: ticker,
    news: {
      items: [{ title: `${ticker} growth`, summary: "strong demand", url: "https://example.com" }],
    },
  }));

  const result = await analyzeSentimentCandidates(candidates, model, []);

  assert.equal(maxInFlight, 3);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.sentiment.label),
    ["bullish", "bullish", "bullish"],
  );
  assert.deepEqual(result.errors, []);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  computeRankingFromSessionDir,
  writeRankingJson,
} from "../agent/ranking-from-workspace.mjs";

test("computeRankingFromSessionDir scores market data and findings sentiment", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ranking-test-"));
  const ticker = "NVDA";

  fs.writeFileSync(
    path.join(tmp, `market_data_${ticker}.json`),
    JSON.stringify({
      ticker,
      shortName: "NVIDIA",
      regularMarketPrice: 900,
      regularMarketChangePercent: 2.5,
      trailingPE: 40,
      fiftyTwoWeekLow: 400,
      fiftyTwoWeekHigh: 950,
      currency: "USD",
    }),
  );

  fs.writeFileSync(
    path.join(tmp, `findings_${ticker}.md`),
    `# NVDA
\`\`\`json
{"label":"bullish","confidence":0.8,"reason":"AI 需求相关新闻偏多"}
\`\`\`
`,
  );

  fs.writeFileSync(
    path.join(tmp, `news_${ticker}.json`),
    JSON.stringify({
      ticker,
      query: "NVDA NVIDIA stock latest news AI 芯片股",
      items: [
        {
          title: "NVIDIA AI demand remains strong",
          url: "https://example.com/nvda-ai",
          summary: "Cloud demand continues to support GPU sales.",
          siteName: "Example News",
          publishedAt: "2026-06-01",
        },
      ],
    }),
  );

  const ranking = computeRankingFromSessionDir(tmp, { theme: "AI 芯片股" });
  assert.equal(ranking.theme, "AI 芯片股");
  assert.equal(ranking.ranking.length, 1);
  assert.equal(ranking.ranking[0].ticker, "NVDA");
  assert.ok(ranking.ranking[0].score > 0);
  assert.ok(ranking.ranking[0].rating);
  assert.equal(ranking.ranking[0].news?.items?.length, 1);
  assert.ok(!ranking.ranking[0].riskFlags?.includes("近期新闻不足"));

  writeRankingJson(tmp, ranking);
  assert.ok(fs.existsSync(path.join(tmp, "ranking.json")));
});

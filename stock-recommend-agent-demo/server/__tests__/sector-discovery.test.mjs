import assert from "node:assert/strict";
import test from "node:test";

import {
  filterBoards,
  pickConstituentTickers,
  rankBoards,
} from "../mcp/sector-discovery.mjs";
import { hasDiscoveryIntent, detectDiscoveryRequest } from "../utils/discovery-intent.mjs";
import { formatResearchTargetHint } from "../utils/company-ticker.mjs";

test("hasDiscoveryIntent matches open-ended sector questions", () => {
  assert.equal(hasDiscoveryIntent("A 股最近有哪些值得关注的方向"), true);
  assert.equal(hasDiscoveryIntent("当前热点板块有哪些"), true);
  assert.equal(hasDiscoveryIntent("研究 NVDA, AMD, TSM"), false);
});

test("detectDiscoveryRequest prefers concept when user mentions 概念", () => {
  const result = detectDiscoveryRequest("概念板块里有哪些值得关注");
  assert.equal(result.isDiscovery, true);
  assert.deepEqual(result.options.boardTypes, ["concept"]);
});

test("filterBoards removes short-term technical boards", () => {
  const boards = filterBoards([
    { name: "昨日打二板以上表现", changePercent: 5, riseCount: 9 },
    { name: "集成电路封测", changePercent: 7.6, riseCount: 13 },
  ]);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].name, "集成电路封测");
});

test("rankBoards sorts by changePercent descending", () => {
  const ranked = rankBoards([
    { name: "A", changePercent: 3 },
    { name: "B", changePercent: 8 },
  ]);
  assert.equal(ranked[0].name, "B");
});

test("pickConstituentTickers normalizes A-share codes", () => {
  const picks = pickConstituentTickers(
    [
      { code: "600519", name: "贵州茅台", changePercent: 2 },
      { code: "000001", name: "平安银行", changePercent: 5 },
    ],
    2,
  );
  assert.equal(picks.length, 2);
  assert.match(picks[0].ticker, /\.SZ$/);
  assert.equal(picks[0].name, "平安银行");
});

test("formatResearchTargetHint renders sector discovery block", () => {
  const hint = formatResearchTargetHint({
    tickers: ["600519.SS"],
    sectorDiscovery: {
      sectors: [
        {
          name: "锂",
          boardTypeLabel: "行业",
          changePercent: 7.38,
          stocks: [{ name: "永杉锂业", ticker: "603399.SS" }],
        },
      ],
      tickerDetails: [{ ticker: "600519.SS", name: "贵州茅台", sectorName: "锂" }],
      disclaimer: "测试免责声明",
    },
  });
  assert.match(hint, /板块发现/);
  assert.match(hint, /锂/);
  assert.match(hint, /600519\.SS/);
});

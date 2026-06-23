import assert from "node:assert/strict";
import test from "node:test";

import { hasResearchIntent, isClarificationQuestion, isFollowUpTurn } from "../utils/turn-mode.mjs";

const pddRanking = {
  ranking: [{ ticker: "PDD", name: "PDD Holdings", score: 70 }],
  theme: "PDD",
};

test("hasResearchIntent detects new research phrasing", () => {
  assert.equal(hasResearchIntent("调研 SpaceX"), true);
  assert.equal(hasResearchIntent("对比 NVDA 和 AMD"), true);
  assert.equal(hasResearchIntent("前三名各自最大风险是什么"), false);
});

test("isClarificationQuestion detects follow-up questions", () => {
  const existing = new Set(["PDD"]);
  assert.equal(isClarificationQuestion("建议买吗", existing), true);
  assert.equal(isClarificationQuestion("PDD 的风险是什么", existing), true);
  assert.equal(isClarificationQuestion("调研 SpaceX", existing), false);
});

test("isFollowUpTurn treats clarification as follow-up but new research as full turn", () => {
  const readRanking = () => pddRanking;

  assert.equal(
    isFollowUpTurn({
      messages: [
        { role: "user", content: "调研 PDD" },
        { role: "assistant", content: "简报" },
        { role: "user", content: "建议买吗" },
      ],
      resetWorkspace: false,
      sessionId: "s1",
      readRanking,
    }),
    true,
  );

  assert.equal(
    isFollowUpTurn({
      messages: [
        { role: "user", content: "调研 PDD" },
        { role: "assistant", content: "简报" },
        { role: "user", content: "调研 SpaceX" },
      ],
      resetWorkspace: false,
      sessionId: "s1",
      readRanking,
    }),
    false,
  );
});

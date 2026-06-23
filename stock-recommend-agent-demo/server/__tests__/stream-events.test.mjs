import assert from "node:assert/strict";
import test from "node:test";

import { parseStreamItem, shouldStreamAssistantToken } from "../agent/stream-events.mjs";

test("parseStreamItem handles updates with subgraph namespace", () => {
  assert.deepEqual(parseStreamItem([["tools:task"], { model_request: {} }]), {
    mode: "updates",
    namespace: ["tools:task"],
    chunk: { model_request: {} },
  });
});

test("parseStreamItem handles dual stream modes without subgraph", () => {
  assert.deepEqual(parseStreamItem(["messages", [{ content: "hi" }, {}]]), {
    mode: "messages",
    namespace: [],
    chunk: [{ content: "hi" }, {}],
  });
});

test("parseStreamItem handles dual stream modes with subgraph namespace", () => {
  assert.deepEqual(parseStreamItem([[], "messages", [{ content: "x" }, {}]]), {
    mode: "messages",
    namespace: [],
    chunk: [{ content: "x" }, {}],
  });
});

test("shouldStreamAssistantToken only allows main orchestrator model output", () => {
  assert.equal(shouldStreamAssistantToken([], { langgraph_node: "model_request" }), true);
  assert.equal(shouldStreamAssistantToken(["tools:task"], { langgraph_node: "model_request" }), false);
  assert.equal(shouldStreamAssistantToken([], { langgraph_node: "tools" }), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { encodeSseEvent } from "../utils/streaming-response.mjs";

test("encodes named server-sent events as JSON payloads", () => {
  assert.equal(
    encodeSseEvent("progress", { step: "fetch_stock_data", index: 2 }),
    'event: progress\ndata: {"step":"fetch_stock_data","index":2}\n\n',
  );
});

test("encodes string payloads without adding extra quotes", () => {
  assert.equal(encodeSseEvent("report_delta", "hello\nworld"), "event: report_delta\ndata: hello\ndata: world\n\n");
});

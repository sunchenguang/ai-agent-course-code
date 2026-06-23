export function createSessionId() {
  return crypto.randomUUID();
}

function parseSseBlock(block) {
  let event = "message";
  const data = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).replace(/^ /, ""));
    }
  }

  return { event, data: data.join("\n") };
}

function parseJsonPayload(data) {
  return data ? JSON.parse(data) : null;
}

export async function requestAgentStream(payload, handlers = {}) {
  const response = await fetch("/api/agent/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.error ?? "Agent 请求失败");
    } catch {
      throw new Error(text.slice(0, 200) || "Agent 请求失败");
    }
  }

  if (!response.body) {
    throw new Error("当前浏览器不支持流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;
  let receivedReport = false;

  function dispatch(block) {
    if (!block.trim()) return;
    const { event, data } = parseSseBlock(block);

    if (event === "report_delta") {
      receivedReport = true;
      handlers.onReportDelta?.(data);
      return;
    }

    if (event === "assistant_delta") {
      handlers.onAssistantDelta?.(data);
      return;
    }

    const parsed = parseJsonPayload(data);
    if (event === "report_start") {
      receivedReport = true;
      handlers.onReportStart?.(parsed);
    }
    if (event === "phase") handlers.onPhase?.(parsed);
    if (event === "agent_start") handlers.onAgentStart?.(parsed);
    if (event === "todo_update") handlers.onTodoUpdate?.(parsed);
    if (event === "tool_call") handlers.onToolCall?.(parsed);
    if (event === "subagent_start") handlers.onSubagentStart?.(parsed);
    if (event === "subagent_done") handlers.onSubagentDone?.(parsed);
    if (event === "artifact") handlers.onArtifact?.(parsed);
    if (event === "ranking") handlers.onRanking?.(parsed);
    if (event === "report_ready") {
      receivedReport = true;
      handlers.onReportReady?.(parsed);
    }
    if (event === "done") {
      finalResult = parsed;
      handlers.onDone?.(parsed);
    }
    if (event === "error") {
      throw new Error(parsed?.error ?? "Agent 请求失败");
    }
  }

  while (true) {
    let value;
    let done;
    try {
      ({ value, done } = await reader.read());
    } catch (error) {
      if (handlers.signal?.aborted) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        /ECONNRESET|aborted|network/i.test(message)
          ? "连接已中断（常见于开发服务器热重载）。请重新发送请求。"
          : message,
      );
    }

    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      dispatch(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  if (buffer.trim()) dispatch(buffer);

  if (!finalResult) {
    if (receivedReport) {
      return null;
    }
    throw new Error("连接意外结束，请重新发送请求。");
  }

  return finalResult;
}

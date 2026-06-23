export async function requestRecommendation(payload) {
  const response = await fetch("/api/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "推荐请求失败");
  }
  return data;
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

export async function requestRecommendationStream(payload, handlers = {}) {
  const response = await fetch("/api/recommend/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    if (text.includes("Cannot POST /api/recommend/stream")) {
      throw new Error("流式推荐接口不可用，请重启后端服务：npm run dev");
    }
    try {
      const data = JSON.parse(text);
      throw new Error(data.error ?? "推荐请求失败");
    } catch {
      throw new Error(text.slice(0, 200) || "推荐请求失败");
    }
  }
  if (!response.body) {
    throw new Error("当前浏览器不支持流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;

  function dispatch(block) {
    if (!block.trim()) return;
    const { event, data } = parseSseBlock(block);

    if (event === "report_delta") {
      handlers.onReportDelta?.(data);
      return;
    }

    const parsed = parseJsonPayload(data);
    if (event === "progress") handlers.onProgress?.(parsed);
    if (event === "metadata") handlers.onMetadata?.(parsed);
    if (event === "ranking") handlers.onRanking?.(parsed);
    if (event === "done") {
      finalResult = parsed;
      handlers.onDone?.(parsed);
    }
    if (event === "error") {
      throw new Error(parsed?.error ?? "推荐请求失败");
    }
  }

  while (true) {
    const { value, done } = await reader.read();
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
  return finalResult;
}

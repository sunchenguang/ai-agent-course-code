import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { createEquityDeskAgent } from "./equity-desk-agent.mjs";
import { readLatestReport, readRankingIfExists } from "./session-workspace.mjs";
import { runStreamingSessionReport } from "./streaming-report-tool.mjs";
import { extractTickersFromText } from "../utils/company-ticker.mjs";
import { resolveResearchTargetsFromText } from "../utils/resolve-company-ticker.mjs";
import { isFollowUpTurn } from "../utils/turn-mode.mjs";

const REPORT_CHUNK_SIZE = 160;
const SUBAGENT_TASK_PREVIEW = 56;

const SILENT_TOOLS = new Set(["read_file", "ls", "glob", "grep", "eval"]);
const MEANINGFUL_FILE_PATTERNS = [
  /research_plan\.md$/i,
  /market_data_/i,
  /findings_/i,
  /ranking\.json$/i,
  /\/reports\/.*\.md$/i,
];

function parseArgs(args) {
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return args;
    }
  }
  return args;
}

function previewText(text, maxLen) {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  return oneLine.length <= maxLen ? oneLine : `${oneLine.slice(0, maxLen - 1)}…`;
}

function stepAgentLabel(namespace) {
  if (!namespace?.length) return "主 Agent";
  return namespace[0]?.replace(/^tools:/, "") ?? "子 Agent";
}

function pathFromArgs(name, args) {
  if (!args || typeof args !== "object") return null;
  if (name === "write_file" || name === "edit_file" || name === "read_file") {
    return typeof args.file_path === "string" ? args.file_path : null;
  }
  return null;
}

function isReportPath(filePath) {
  return Boolean(filePath && /\/reports\/.*\.md$/i.test(filePath));
}

function isMeaningfulFile(filePath) {
  return MEANINGFUL_FILE_PATTERNS.some((pattern) => pattern.test(String(filePath ?? "")));
}

function shortenFilePath(filePath) {
  return String(filePath ?? "")
    .replace(/^\/workspace\/sessions\/[^/]+\//, "")
    .replace(/^\/workspace\//, "");
}

function toLangChainMessages(messages = []) {
  return messages.map((msg) => {
    const content = String(msg.content ?? "");
    if (msg.role === "assistant") return new AIMessage(content);
    return new HumanMessage(content);
  });
}

function extractTodos(data) {
  const todos = data?.todos ?? data?.todoList ?? data?.items;
  if (Array.isArray(todos)) return todos;
  for (const msg of data?.messages ?? []) {
    if (msg.additional_kwargs?.todos) return msg.additional_kwargs.todos;
  }
  return null;
}

function isFollowUpTurnForSession({ messages, resetWorkspace, sessionId }) {
  return isFollowUpTurn({
    messages,
    resetWorkspace,
    sessionId,
    readRanking: readRankingIfExists,
  });
}

function emitRanking(send, turnState, payload) {
  if (!payload?.ranking?.length) return;
  turnState.rankingUpdatedThisTurn = true;
  send("ranking", payload);
}

function emitReportDeltas(content, send, reportStreamState) {
  const text = String(content ?? "");
  if (!text) return;

  const start = reportStreamState.emittedLength;
  const slice = start >= text.length ? "" : text.slice(start);
  if (!slice) return;

  for (let i = 0; i < slice.length; i += REPORT_CHUNK_SIZE) {
    const chunk = slice.slice(i, i + REPORT_CHUNK_SIZE);
    send("report_delta", chunk);
  }
  reportStreamState.emittedLength = text.length;
  reportStreamState.active = true;
}

function extractMessageChunkText(messageChunk) {
  if (!messageChunk) return "";
  const content = messageChunk.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text")
      .map((part) => part.text ?? "")
      .join("");
  }
  return "";
}

export function parseStreamItem(item) {
  if (!Array.isArray(item)) return null;

  if (item.length === 2) {
    const [first, second] = item;
    if (first === "updates" || first === "messages") {
      return { mode: first, namespace: [], chunk: second };
    }
    return { mode: "updates", namespace: first, chunk: second };
  }

  if (item.length === 3) {
    const [first, second, third] = item;
    if (second === "updates" || second === "messages") {
      return { mode: second, namespace: first, chunk: third };
    }
  }

  return null;
}

export function shouldStreamAssistantToken(namespace, metadata) {
  if (Array.isArray(namespace) && namespace.length > 0) return false;
  if (metadata?.langgraph_node && metadata.langgraph_node !== "model_request") return false;
  return true;
}

function emitAssistantToken(token, send, assistantState) {
  if (!token) return;
  send("assistant_delta", token);
  assistantState.lastAssistantText += token;
  assistantState.lastEmittedAssistantText = assistantState.lastAssistantText;
}

function handleMessageStreamChunk(chunk, namespace, send, assistantState) {
  const [messageChunk, metadata] = Array.isArray(chunk) ? chunk : [chunk, {}];
  if (!shouldStreamAssistantToken(namespace, metadata)) return;
  const token = extractMessageChunkText(messageChunk);
  emitAssistantToken(token, send, assistantState);
}

function handleUpdatesChunk(namespace, chunk, context) {
  const { send, pending, turnState, reportStreamState } = context;

  for (const [node, data] of Object.entries(chunk)) {
    const agentLabel = stepAgentLabel(namespace);

    if (node === "model_request") {
      for (const msg of data?.messages ?? []) {
        for (const tc of msg.tool_calls ?? []) {
          if (!tc.id || !tc.name) continue;

          const args = parseArgs(tc.args);
          const filePath = pathFromArgs(tc.name, args);

          if (tc.name === "run_batch_stock_research") {
            send("tool_call", {
              agent: agentLabel,
              tool: tc.name,
              label: `批量调研 ${Array.isArray(args?.tickers) ? args.tickers.join("、") : "股票"}`,
            });
            send("phase", { phase: "plan", status: "completed" });
            send("phase", { phase: "research", status: "running" });
            continue;
          }

          if (tc.name === "resolve_company_ticker") {
            send("tool_call", {
              agent: agentLabel,
              tool: tc.name,
              label: `解析 ${args?.companyName ?? "公司"} ticker`,
            });
            continue;
          }

          if (tc.name === "generate_streaming_report") {
            turnState.reportGeneratedThisTurn = true;
            send("tool_call", {
              agent: agentLabel,
              tool: tc.name,
              label: "流式生成研报",
            });
            send("phase", { phase: "report", status: "running" });
            continue;
          }

          if (tc.name === "task") {
            const subagentType = args?.subagent_type ?? args?.agent ?? "subagent";
            send("subagent_start", {
              agent: agentLabel,
              type: subagentType,
              task: previewText(args?.description ?? args?.prompt ?? "", SUBAGENT_TASK_PREVIEW),
            });
            if (subagentType === "market-researcher") {
              send("phase", { phase: "research", status: "running" });
            } else if (subagentType === "quant-analyst") {
              send("phase", { phase: "research", status: "completed" });
              send("phase", { phase: "quant", status: "running" });
            }
            continue;
          }

          if (tc.name === "write_file" && filePath) {
            pending.set(tc.id, { name: tc.name, path: filePath });
            if (isReportPath(filePath) && typeof args.content === "string") {
              send("report_start", { path: shortenFilePath(filePath) });
              reportStreamState.emittedLength = 0;
              emitReportDeltas(args.content, send, reportStreamState);
            }
          }

          if (tc.name === "edit_file" && filePath) {
            pending.set(tc.id, { name: tc.name, path: filePath });
          }

          if (!SILENT_TOOLS.has(tc.name) && tc.name !== "task") {
            send("tool_call", {
              agent: agentLabel,
              tool: tc.name,
              label: formatToolLabel(tc.name, args, filePath),
            });
          }
        }

        const text = typeof msg.content === "string" ? msg.content : "";
        if (text.trim()) {
          const state = context.assistantState;
          state.lastAssistantText = text;
          if (text.startsWith(state.lastEmittedAssistantText)) {
            const delta = text.slice(state.lastEmittedAssistantText.length);
            if (delta) {
              send("assistant_delta", delta);
            }
          } else if (!state.lastEmittedAssistantText) {
            send("assistant_delta", text);
          }
          state.lastEmittedAssistantText = text;
        }
      }
    } else if (node === "tools") {
      for (const msg of data?.messages ?? []) {
        if (msg.type !== "tool") continue;

        if (msg.name === "run_batch_stock_research") {
          try {
            const payload = JSON.parse(String(msg.content));
            if (payload.ranking?.length) {
              emitRanking(send, turnState, {
                ranking: payload.ranking,
                theme: payload.theme ?? "",
              });
            }
            const tickerCount = Array.isArray(payload.tickers) ? payload.tickers.length : 0;
            if (tickerCount > 0) {
              send("artifact", {
                kind: "research",
                label: `调研 ${tickerCount} 只股票`,
              });
            }
            send("artifact", { kind: "ranking", label: "推荐排序" });
            send("phase", { phase: "research", status: "completed" });
            send("phase", { phase: "quant", status: "completed" });
          } catch {
            send("phase", { phase: "research", status: "completed" });
          }
          continue;
        }

        if (msg.name === "task") {
          send("subagent_done", {});
          continue;
        }

        if (msg.name === "compute_stock_ranking") {
          try {
            const ranking = JSON.parse(String(msg.content));
            emitRanking(send, turnState, {
              ranking: ranking.ranking ?? [],
              theme: ranking.theme,
            });
            send("phase", { phase: "quant", status: "completed" });
          } catch {
            // ranking event will be sent at end from disk
          }
        }

        const op = msg.tool_call_id ? pending.get(msg.tool_call_id) : undefined;
        const filePath =
          op?.path ?? String(msg.content).match(/['`](\/[^'`]+)['`]/)?.[1] ?? null;

        if (filePath && isReportPath(filePath) && msg.name === "edit_file") {
          // 内存模式：报告内容仅通过 report_delta 流式推送
        }

        if (filePath && isMeaningfulFile(filePath) && (msg.name === "write_file" || msg.name === "edit_file")) {
          if (filePath.includes("/reports/")) {
            send("artifact", { kind: "report", label: "投研研报" });
            send("phase", { phase: "report", status: "running" });
          }
          if (filePath.includes("research_plan")) {
            send("phase", { phase: "plan", status: "completed" });
          }
          if (filePath.includes("ranking.json")) {
            send("phase", { phase: "quant", status: "completed" });
          }
        }

        if (msg.tool_call_id) pending.delete(msg.tool_call_id);
      }
    } else if (node === "todoListMiddleware.after_model") {
      const todos = extractTodos(data);
      if (todos) {
        send("todo_update", { todos });
        send("phase", { phase: "plan", status: "running" });
      }
    }
  }
}

export async function runAgentStream(
  { sessionId, messages, resetWorkspace = false },
  { send, resetSessionWorkspace, ensureSessionWorkspace },
) {
  const userCount = messages.filter((item) => item.role === "user").length;
  const isFollowUp = isFollowUpTurnForSession({ messages, resetWorkspace, sessionId });
  const turnState = { reportGeneratedThisTurn: false, rankingUpdatedThisTurn: false };

  if (resetWorkspace) {
    resetSessionWorkspace(sessionId);
  } else if (!isFollowUp && userCount > 1) {
    resetSessionWorkspace(sessionId);
  } else {
    ensureSessionWorkspace(sessionId);
  }
  const reportStreamState = { emittedLength: 0, active: false };
  const emitReportEvent = (event, payload) => {
    if (event === "report_start") {
      turnState.reportGeneratedThisTurn = true;
    }
    if (event === "report_delta") {
      reportStreamState.emittedLength += String(payload ?? "").length;
      reportStreamState.active = true;
    }
    send(event, payload);
  };
  const lastUserMessage =
    [...messages].reverse().find((item) => item.role === "user")?.content ?? "";
  const researchResolution = isFollowUp
    ? { tickers: extractTickersFromText(lastUserMessage), details: [] }
    : await resolveResearchTargetsFromText(lastUserMessage);
  const agent = createEquityDeskAgent(sessionId, {
    isFollowUp,
    emit: emitReportEvent,
    researchResolution,
  });
  const recursionLimit = Number(process.env.RECURSION_LIMIT) || 300;
  const pending = new Map();
  const assistantState = {
    lastAssistantText: "",
    lastEmittedAssistantText: "",
  };

  send("agent_start", { sessionId });

  for await (const item of await agent.stream(
    { messages: toLangChainMessages(messages) },
    { streamMode: ["updates", "messages"], subgraphs: true, recursionLimit },
  )) {
    const parsed = parseStreamItem(item);
    if (!parsed) continue;

    if (parsed.mode === "messages") {
      handleMessageStreamChunk(parsed.chunk, parsed.namespace, send, assistantState);
      continue;
    }

    handleUpdatesChunk(parsed.namespace, parsed.chunk, {
      send,
      pending,
      turnState,
      reportStreamState,
      assistantState,
    });
  }

  const { lastAssistantText } = assistantState;

  const rankingData = readRankingIfExists(sessionId);
  if (turnState.rankingUpdatedThisTurn && rankingData?.ranking?.length) {
    send("ranking", {
      ranking: rankingData.ranking,
      theme: rankingData.theme ?? "",
    });
  }

  if (!isFollowUp && rankingData?.ranking?.length && !turnState.reportGeneratedThisTurn) {
    try {
      await runStreamingSessionReport(sessionId, emitReportEvent, { theme: rankingData.theme });
      turnState.reportGeneratedThisTurn = true;
    } catch {
      // ranking 存在但报告生成失败时，仍返回 ranking 与对话摘要
    }
  }

  const reportGeneratedThisTurn = turnState.reportGeneratedThisTurn;
  const reportMarkdown = reportGeneratedThisTurn ? readLatestReport(sessionId) : "";
  if (reportMarkdown && reportStreamState.emittedLength < reportMarkdown.length) {
    emitReportDeltas(reportMarkdown, send, reportStreamState);
  }

  if (reportGeneratedThisTurn && reportMarkdown) {
    send("report_ready", { reportMarkdown });
    send("phase", { phase: "report", status: "completed" });
  }

  send("done", {
    sessionId,
    assistantMessage: lastAssistantText,
    ranking: turnState.rankingUpdatedThisTurn ? rankingData?.ranking ?? [] : [],
    theme: turnState.rankingUpdatedThisTurn ? rankingData?.theme ?? "" : "",
    reportMarkdown,
    reportGenerated: reportGeneratedThisTurn,
    rankingUpdated: turnState.rankingUpdatedThisTurn,
    isFollowUp,
  });

  return {
    assistantMessage: lastAssistantText,
    ranking: rankingData?.ranking ?? [],
    reportMarkdown,
    reportGenerated: reportGeneratedThisTurn,
    isFollowUp,
  };
}

function formatToolLabel(toolName, args, filePath) {
  if (toolName === "write_file" || toolName === "edit_file") {
    return `${toolName === "write_file" ? "写入" : "修订"} ${shortenFilePath(filePath)}`;
  }
  if (toolName === "fetch_stock_quote") {
    return `获取 ${args?.ticker ?? "股票"} 行情`;
  }
  if (toolName === "search_stock_news") {
    return `搜索 ${args?.ticker ?? "股票"} 新闻`;
  }
  if (toolName === "compute_stock_ranking") {
    return "计算推荐排名";
  }
  if (toolName === "resolve_company_ticker") {
    return `解析 ${args?.companyName ?? "公司"} ticker`;
  }
  if (toolName === "run_batch_stock_research") {
    return `批量调研 ${Array.isArray(args?.tickers) ? args.tickers.join("、") : "股票"}`;
  }
  if (toolName === "save_stock_findings") {
    return `保存 ${args?.ticker ?? "股票"} 调研笔记`;
  }
  if (toolName === "generate_streaming_report") {
    return "流式生成研报";
  }
  return toolName;
}

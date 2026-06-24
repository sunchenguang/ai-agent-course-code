import { useEffect, useMemo, useRef, useState } from "react";

import AgentPanel from "./AgentPanel.jsx";
import { createSessionId, requestAgentStream } from "./agent-session.js";
import ChatInput from "./components/ChatInput.jsx";
import Sidebar from "./components/Sidebar.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import ClassicMode from "./ClassicMode.jsx";
import { MarkdownPreview, RankingSection } from "./shared-ui.jsx";

const agentExamples = [
  "A 股最近有哪些值得关注的方向？每个方向推荐 2 只代表性股票",
  "研究 AI 芯片股：NVDA, AMD, TSM, AVGO, ASML，给出推荐排序和风险提示",
  "对比 NVDA 和 AMD 的估值与近期新闻情绪，我更关心中长期基本面",
  "分析美股科技巨头 MSFT, AAPL, GOOGL, AMZN, META 的动量与风险",
];

const emptyActivity = () => ({
  subagents: [],
  artifacts: [],
  toolCount: 0,
});

const emptyPhaseProgress = () => ({
  active: "",
  completed: [],
});

function updatePhaseProgress(prev, { phase, status }) {
  if (!phase) return prev;

  let { active, completed } = prev;

  if (status === "running") {
    if (phase === "research" && !completed.includes("plan")) {
      completed = [...completed, "plan"];
    }
    active = phase;
    return { active, completed };
  }

  if (status === "completed") {
    if (!completed.includes(phase)) {
      completed = [...completed, phase];
    }
    if (active === phase) {
      active = "";
    }
    return { active, completed };
  }

  return prev;
}

function formatAssistantMarkdown(message) {
  if (message.content?.trim()) return message.content.trim();
  if (message.streaming) return "_Agent 分析中…_";
  return "";
}

function sessionTitleFromMessages(messages) {
  const firstUser = messages.find((item) => item.role === "user");
  if (!firstUser?.content) return "新对话";
  const text = firstUser.content.trim();
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

const SCROLL_STICKY_THRESHOLD = 80;

function isNearBottom(node) {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_STICKY_THRESHOLD;
}

export default function App() {
  const [mode, setMode] = useState("agent");
  const [sessionId, setSessionId] = useState(() => createSessionId());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(emptyActivity);
  const [todos, setTodos] = useState([]);
  const [phaseProgress, setPhaseProgress] = useState(emptyPhaseProgress);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const resetWorkspaceRef = useRef(false);
  const chatLogRef = useRef(null);
  const pinnedToBottomRef = useRef(true);
  const streamAbortRef = useRef(null);
  const lastSentTextRef = useRef("");
  const currentRequestIsFollowUpRef = useRef(false);

  const chatMessages = useMemo(() => messages, [messages]);
  const sessionTitle = useMemo(() => sessionTitleFromMessages(messages), [messages]);
  const hasConversation = chatMessages.length > 0 || loading;

  useEffect(() => {
    const node = chatLogRef.current;
    if (!node) return;

    function handleScroll() {
      pinnedToBottomRef.current = isNearBottom(node);
    }

    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, [hasConversation]);

  useEffect(() => {
    const node = chatLogRef.current;
    if (!node || !pinnedToBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [chatMessages, loading]);

  function updateStreamingAssistant(updater) {
    setMessages((prev) => {
      const index = prev.findLastIndex((item) => item.role === "assistant" && item.streaming);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = updater(next[index]);
      return next;
    });
  }

  function finalizeStreamingAssistantMessage(content = "") {
    setMessages((prev) => {
      const index = prev.findLastIndex((item) => item.role === "assistant" && item.streaming);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = {
        ...next[index],
        content: next[index].content?.trim() ? next[index].content : content,
        streaming: false,
      };
      return next;
    });
  }

  function handleNewResearch() {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setLoading(false);
    const nextSessionId = createSessionId();
    setSessionId(nextSessionId);
    setMessages([]);
    setInput("");
    setError("");
    setActivity(emptyActivity());
    setTodos([]);
    setPhaseProgress(emptyPhaseProgress());
    pinnedToBottomRef.current = true;
    setShowAgentPanel(false);
    resetWorkspaceRef.current = true;
  }

  function handleStop() {
    if (!loading || !streamAbortRef.current) return;
    streamAbortRef.current.abort();
  }

  async function handleSend(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const isFollowUp = messages.length > 0;
    currentRequestIsFollowUpRef.current = isFollowUp;
    lastSentTextRef.current = text;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages([
      ...nextMessages,
      {
        role: "assistant",
        content: "",
        streaming: true,
        ranking: [],
        theme: "",
        reportMarkdown: "",
        reportStreaming: false,
      },
    ]);
    setInput("");
    setLoading(true);
    setError("");
    setActivity(emptyActivity());
    setTodos([]);
    pinnedToBottomRef.current = true;
    setPhaseProgress(isFollowUp ? emptyPhaseProgress() : { active: "plan", completed: [] });
    setShowAgentPanel(true);

    const shouldReset = resetWorkspaceRef.current;
    resetWorkspaceRef.current = false;

    streamAbortRef.current?.abort();
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    let reportContentReceived = false;

    try {
      await requestAgentStream(
        {
          sessionId,
          messages: nextMessages,
          resetWorkspace: shouldReset,
        },
        {
          signal: abortController.signal,
          onTodoUpdate: ({ todos: nextTodos }) => {
            if (nextTodos?.length) setTodos(nextTodos);
          },
          onPhase: (payload) => {
            setPhaseProgress((prev) => updatePhaseProgress(prev, payload));
          },
          onArtifact: (data) => {
            if (!data?.kind) return;
            setActivity((prev) => ({
              ...prev,
              artifacts: [
                ...prev.artifacts.filter((item) => item.kind !== data.kind),
                data,
              ],
            }));
          },
          onToolCall: () => {
            setActivity((prev) => ({
              ...prev,
              toolCount: prev.toolCount + 1,
            }));
          },
          onSubagentStart: (data) => {
            setPhaseProgress((prev) => updatePhaseProgress(prev, { phase: "research", status: "running" }));
            setActivity((prev) => ({
              ...prev,
              subagents: [...prev.subagents, { ...data, done: false }],
            }));
          },
          onSubagentDone: () => {
            setActivity((prev) => {
              const doneIndex = prev.subagents.findIndex((item) => !item.done);
              if (doneIndex === -1) return prev;

              const nextSubagents = prev.subagents.map((item, index) =>
                index === doneIndex ? { ...item, done: true } : item,
              );
              const finished = nextSubagents[doneIndex];
              if (finished?.type === "quant-analyst") {
                setPhaseProgress((current) =>
                  updatePhaseProgress(current, { phase: "quant", status: "completed" }),
                );
              }
              return { ...prev, subagents: nextSubagents };
            });
          },
          onReportStart: () => {
            reportContentReceived = true;
            updateStreamingAssistant((msg) => ({ ...msg, reportStreaming: true }));
            setPhaseProgress((prev) => updatePhaseProgress(prev, { phase: "report", status: "running" }));
          },
          onAssistantDelta: (chunk) => {
            if (!chunk) return;
            setMessages((prev) => {
              const index = prev.findLastIndex((item) => item.role === "assistant" && item.streaming);
              if (index === -1) {
                return [...prev, { role: "assistant", content: chunk, streaming: true }];
              }
              const next = [...prev];
              next[index] = {
                ...next[index],
                content: `${next[index].content ?? ""}${chunk}`,
              };
              return next;
            });
          },
          onReportDelta: (chunk) => {
            if (!chunk) return;
            reportContentReceived = true;
            updateStreamingAssistant((msg) => ({
              ...msg,
              reportStreaming: true,
              reportMarkdown: `${msg.reportMarkdown ?? ""}${chunk}`,
            }));
          },
          onRanking: (data) => {
            if (!data.ranking?.length) return;
            updateStreamingAssistant((msg) => ({
              ...msg,
              ranking: data.ranking,
              theme: data.theme || msg.theme || "",
            }));
          },
          onSectorDiscovery: (data) => {
            if (data?.error || !data?.sectors?.length) return;
            updateStreamingAssistant((msg) => ({
              ...msg,
              theme: data.theme || msg.theme || "A 股板块发现",
            }));
            setActivity((prev) => ({
              ...prev,
              artifacts: [
                ...prev.artifacts.filter((item) => item.kind !== "sector_discovery"),
                { kind: "sector_discovery", ...data },
              ],
            }));
          },
          onReportReady: () => {
            reportContentReceived = true;
            updateStreamingAssistant((msg) => ({ ...msg, reportStreaming: false }));
            setPhaseProgress((prev) => updatePhaseProgress(prev, { phase: "report", status: "completed" }));
          },
          onDone: (data) => {
            setMessages((prev) => {
              const index = prev.findLastIndex((item) => item.role === "assistant" && item.streaming);
              const fallback = {
                role: "assistant",
                content: data.assistantMessage ?? "",
                streaming: false,
                ranking: data.rankingUpdated ? data.ranking ?? [] : [],
                theme: data.rankingUpdated ? data.theme ?? "" : "",
                reportMarkdown: data.reportGenerated ? data.reportMarkdown ?? "" : "",
                reportStreaming: false,
              };

              if (index === -1) {
                if (!fallback.content && !fallback.ranking.length && !fallback.reportMarkdown) return prev;
                return [...prev, fallback];
              }

              const next = [...prev];
              const current = next[index];
              next[index] = {
                ...current,
                content: fallback.content || current.content || "",
                streaming: false,
                ranking: current.ranking?.length
                  ? current.ranking
                  : data.rankingUpdated
                    ? fallback.ranking
                    : [],
                theme: current.theme || (data.rankingUpdated ? fallback.theme : ""),
                reportMarkdown:
                  current.reportMarkdown || (data.reportGenerated ? fallback.reportMarkdown : ""),
                reportStreaming: false,
              };
              return next;
            });
          },
        },
      );

      if (reportContentReceived) {
        finalizeStreamingAssistantMessage();
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        const textToRestore = lastSentTextRef.current;
        setMessages((prev) => {
          let next = [...prev];
          const assistantIdx = next.findLastIndex((item) => item.role === "assistant" && item.streaming);
          if (assistantIdx === -1) return next;
          next = next.slice(0, assistantIdx);
          if (next.at(-1)?.role === "user") {
            next = next.slice(0, -1);
          }
          return next;
        });
        if (textToRestore) setInput(textToRestore);
        setActivity(emptyActivity());
        setTodos([]);
        setPhaseProgress(emptyPhaseProgress());
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (!reportContentReceived) {
        finalizeStreamingAssistantMessage("请求未完成，请重试。");
      } else {
        finalizeStreamingAssistantMessage();
      }
    } finally {
      if (streamAbortRef.current === abortController) {
        streamAbortRef.current = null;
      }
      setPhaseProgress((prev) => {
        const completed = [...prev.completed];
        if (prev.active && !completed.includes(prev.active)) {
          completed.push(prev.active);
        }
        if (reportContentReceived && !completed.includes("report")) {
          completed.push("report");
        }
        return { active: "", completed };
      });
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        mode={mode}
        onModeChange={setMode}
        onNewChat={handleNewResearch}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        sessionTitle={mode === "agent" ? sessionTitle : "经典流水线"}
      />

      <div className={`main-area${showAgentPanel && mode === "agent" ? " with-agent-panel" : ""}`}>
        <header className="main-header">
          <button
            aria-label="打开侧边栏"
            className="menu-btn"
            onClick={() => setSidebarCollapsed(false)}
            type="button"
          >
            ☰
          </button>
          <div className="main-header-title">
            <strong>{mode === "agent" ? "Agent 投研" : "经典流水线"}</strong>
            <span>{mode === "agent" ? sessionTitle : "固定 6 步 LangGraph 对照演示"}</span>
          </div>
          {mode === "agent" ? (
            <div className="header-actions">
              <button
                aria-pressed={showAgentPanel}
                className={`header-action${showAgentPanel ? " active" : ""}`}
                onClick={() => setShowAgentPanel((prev) => !prev)}
                type="button"
              >
                Agent 活动
              </button>
              <button className="header-action" onClick={handleNewResearch} type="button">
                新对话
              </button>
            </div>
          ) : null}
        </header>

        {mode === "classic" ? (
          <div className="classic-main">
            <ClassicMode />
          </div>
        ) : (
          <>
            <div
              className={`chat-scroll${hasConversation ? " chatting" : " empty"}`}
              ref={chatLogRef}
            >
              {!hasConversation ? (
                <WelcomeScreen examples={agentExamples} onSelectExample={setInput} />
              ) : (
                <div className="message-list">
                  {chatMessages.map((msg, index) => (
                    <div className={`message-row ${msg.role}`} key={`${msg.role}-${index}`}>
                      <div className={`message-avatar ${msg.role}`}>
                        {msg.role === "user" ? "你" : "AI"}
                      </div>
                      <div className={`message-content${msg.streaming ? " streaming" : ""}`}>
                        {msg.role === "assistant" ? (
                          <>
                            <MarkdownPreview markdown={formatAssistantMarkdown(msg)} />
                            {msg.ranking?.length ? (
                              <div className="inline-result">
                                <RankingSection
                                  ranking={msg.ranking}
                                  theme={msg.theme || "投研推荐"}
                                  tickers={msg.ranking.map((i) => i.ticker)}
                                />
                              </div>
                            ) : null}
                            {msg.reportMarkdown ? (
                              <section
                                className={`report inline-report${msg.reportStreaming ? " streaming" : ""}`}
                              >
                                <div className="report-label">
                                  {msg.reportStreaming ? "研报生成中…" : "投研报告"}
                                </div>
                                <MarkdownPreview markdown={msg.reportMarkdown} />
                              </section>
                            ) : null}
                          </>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {error ? <div className="error inline-error">{error}</div> : null}
                </div>
              )}
            </div>

            <ChatInput
              loading={loading}
              onChange={setInput}
              onStop={handleStop}
              onSubmit={handleSend}
              placeholder="描述研究任务，例如股票池、关注点和分析角度…"
              value={input}
            />
          </>
        )}
      </div>

      {mode === "agent" && showAgentPanel ? (
        <AgentPanel
          activity={activity}
          loading={loading}
          onClose={() => setShowAgentPanel(false)}
          phaseProgress={phaseProgress}
          todos={todos}
        />
      ) : null}
    </div>
  );
}

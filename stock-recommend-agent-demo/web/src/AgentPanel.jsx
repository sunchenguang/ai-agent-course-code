export default function AgentPanel({
  activity,
  todos,
  loading,
  phaseProgress,
  onClose,
}) {
  const { subagents, artifacts, toolCount } = activity;

  const PHASES = [
    { id: "plan", label: "规划" },
    { id: "research", label: "调研" },
    { id: "quant", label: "量化" },
    { id: "report", label: "研报" },
  ];

  function formatTodoStatus(status) {
    return (
      {
        pending: "待办",
        in_progress: "进行中",
        completed: "已完成",
      }[status] ?? status
    );
  }

  function subagentLabel(type) {
    return (
      {
        "market-researcher": "市场调研员",
        "quant-analyst": "量化分析师",
        editor: "编辑审阅",
      }[type] ?? type
    );
  }

  function phaseClass(phaseId, { active, completed }, isLoading) {
    if (completed.includes(phaseId)) return "completed";
    if (active === phaseId && isLoading) return "active";
    if (active === phaseId && !isLoading) return "completed";
    return "";
  }

  function phaseHint(phaseId, { active, completed }, isLoading) {
    if (completed.includes(phaseId) || (active === phaseId && !isLoading)) return "已完成";
    if (active === phaseId && isLoading) return "进行中";
    return "待开始";
  }

  return (
    <aside className="agent-panel">
      <div className="agent-panel-head">
        <div>
          <p className="panel-label">Agent Activity</p>
          <h2>{loading ? "执行中…" : "执行概览"}</h2>
        </div>
        {onClose ? (
          <button aria-label="关闭面板" className="panel-close" onClick={onClose} type="button">
            ×
          </button>
        ) : null}
      </div>

      <section className="agent-section">
        <h3>流程进度</h3>
        <div className="phase-track">
          {PHASES.map((phase) => {
            const status = phaseClass(phase.id, phaseProgress, loading);
            return (
              <div className={`phase-step ${status}`} key={phase.id}>
                <span className="phase-badge">
                  {status === "completed" ? "✓" : PHASES.findIndex((item) => item.id === phase.id) + 1}
                </span>
                <strong>{phase.label}</strong>
                <em>{phaseHint(phase.id, phaseProgress, loading)}</em>
              </div>
            );
          })}
        </div>
      </section>

      {todos?.length ? (
        <section className="agent-section">
          <h3>当前任务</h3>
          <ul className="todo-list compact">
            {todos.slice(0, 5).map((todo, index) => (
              <li className={`todo-item todo-${todo.status ?? "pending"}`} key={todo.id ?? index}>
                <span>{formatTodoStatus(todo.status)}</span>
                <p>{todo.content ?? todo.title ?? String(todo)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {subagents.length ? (
        <section className="agent-section">
          <h3>子 Agent</h3>
          <ul className="subagent-list">
            {subagents.map((item, index) => (
              <li className={item.done ? "done" : "running"} key={`${item.type}-${index}`}>
                <div className="subagent-row">
                  <strong>{subagentLabel(item.type)}</strong>
                  <em>{item.done ? "完成" : "进行中"}</em>
                </div>
                {item.task ? <p>{item.task}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {artifacts.length ? (
        <section className="agent-section">
          <h3>本轮产出</h3>
          <ul className="artifact-list">
            {artifacts.map((item) => (
              <li className="artifact-item" key={item.kind}>
                <span>{item.label}</span>
                <em>会话内存</em>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {toolCount > 0 ? (
        <p className="agent-meta">本轮已调用 {toolCount} 次工具</p>
      ) : null}

      {!loading && !subagents.length && !todos?.length && !artifacts.length ? (
        <p className="agent-empty">发送研究任务后，这里会展示流程进度与子 Agent 状态。</p>
      ) : null}
    </aside>
  );
}

const modes = [
  { id: "agent", label: "Agent 投研", icon: "◆" },
  { id: "classic", label: "经典流水线", icon: "▣" },
];

export default function Sidebar({
  mode,
  onModeChange,
  onNewChat,
  sessionTitle,
  collapsed,
  onToggleCollapse,
}) {
  return (
    <>
      {collapsed ? null : <div className="sidebar-backdrop" onClick={onToggleCollapse} role="presentation" />}

      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="brand-icon">投</span>
            <span className="brand-name">投研助手</span>
          </div>
          <button className="sidebar-new-chat" onClick={onNewChat} type="button">
            <span aria-hidden="true">+</span>
            新对话
          </button>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section-label">模式</p>
          {modes.map((item) => (
            <button
              className={`sidebar-nav-item${mode === item.id ? " active" : ""}`}
              key={item.id}
              onClick={() => onModeChange(item.id)}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-history">
          <p className="sidebar-section-label">当前会话</p>
          <div className="sidebar-session">
            <span className="session-dot" />
            <span className="session-title">{sessionTitle}</span>
          </div>
          <p className="sidebar-hint">会话仅保存在内存，刷新页面后清空</p>
        </div>

        <div className="sidebar-footer">
          <p>技术演示 · 不构成投资建议</p>
        </div>
      </aside>
    </>
  );
}

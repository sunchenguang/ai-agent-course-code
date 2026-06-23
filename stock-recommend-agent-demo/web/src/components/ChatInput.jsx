export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  loading,
  placeholder = "给投研助手发送消息…",
  disabled = false,
}) {
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading && !disabled && value.trim()) {
        onSubmit(event);
      }
    }
  }

  function handleStopClick(event) {
    event.preventDefault();
    onStop?.();
  }

  return (
    <form className="chat-input-bar" onSubmit={onSubmit}>
      <div className="chat-input-box">
        <textarea
          disabled={loading || disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          value={value}
        />
        <div className="chat-input-actions">
          <span className="input-hint">
            {loading ? "生成中，点击右侧按钮可停止" : "Enter 发送 · Shift+Enter 换行"}
          </span>
          {loading ? (
            <button
              aria-label="停止生成"
              className="send-btn stop-btn"
              onClick={handleStopClick}
              type="button"
            >
              <svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
                <rect height="12" rx="1.5" width="12" x="6" y="6" />
              </svg>
            </button>
          ) : (
            <button
              aria-label="发送消息"
              className="send-btn"
              disabled={disabled || !value.trim()}
              type="submit"
            >
              <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
                <path
                  d="M12 19V5M12 5l-5 5M12 5l5 5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

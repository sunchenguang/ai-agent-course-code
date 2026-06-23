export default function WelcomeScreen({ title = "投研助手", subtitle, examples, onSelectExample }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-logo">{title}</div>
      <p className="welcome-subtitle">
        {subtitle ?? "描述你的研究需求，Agent 将规划任务、委派子 Agent、生成中文投研报告"}
      </p>
      <div className="welcome-examples">
        {examples.map((example) => (
          <button key={example} onClick={() => onSelectExample(example)} type="button">
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

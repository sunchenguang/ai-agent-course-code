# Agent 架构说明

本项目提供两种执行模式，用于演示 **Workflow vs Agent**。

## Agent 投研模式（默认）

基于 [DeepAgents](https://github.com/langchain-ai/deepagents)，对齐 `deep-research-assistant` 架构：

```
主 Agent（Equity Research Desk）
  ├── Skills: stock-research / equity-report-writer
  ├── Memory: AGENTS.md
  ├── 子 Agent: market-researcher  → 行情 + 新闻
  ├── 子 Agent: quant-analyst      → 规则打分 → ranking.json
  └── 子 Agent: editor             → 审阅报告
```

### 典型流程

1. 主 Agent `write_todos` 规划任务
2. **并行委派** `market-researcher`（每股一个 task）
3. 委派 `quant-analyst` 调用 `compute_stock_ranking` 生成 ranking
4. 主 Agent 调用 `generate_streaming_report` 流式撰写报告
5. （可选）委派 `editor` 审阅；Demo 默认跳过

**回退**：子 Agent 委派失败时，主 Agent 可调用 `run_batch_stock_research`。

### API

`POST /api/agent/stream` — SSE 流式，请求体：

```json
{
  "sessionId": "uuid",
  "messages": [{ "role": "user", "content": "研究 NVDA, AMD..." }],
  "resetWorkspace": false
}
```

### 会话范围

- 对话历史保存在浏览器 React state，**刷新页面清空**
- 中间结果与报告保存在服务端**内存**（按 sessionId 隔离），**不写 workspace 磁盘**
- 点击「新研究」会生成新 sessionId 并清空对应内存会话

## 经典流水线模式

固定 6 步 LangGraph：`/api/recommend/stream`

用于对照：无 Agent 规划、无子 Agent 委派。

## 环境变量

见 `.env.example`。Agent 模式 **必须** 配置 `OPENAI_API_KEY`。

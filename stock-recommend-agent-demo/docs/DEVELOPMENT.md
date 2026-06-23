# 开发者文档

面向参与 `stock-recommend-agent-demo` 开发与扩展的工程师。业务流程说明见 [FLOW.md](./FLOW.md)。

## 目录结构

```
stock-recommend-agent-demo/
├── server/                      # 后端
│   ├── index.mjs                # Express 入口，API 路由
│   ├── graph.mjs                # LangGraph 图定义（同步模式）
│   ├── state.mjs                # GraphState 状态注解
│   ├── recommendation-stream.mjs # 流式执行编排（前端实际使用）
│   ├── nodes/                   # Agent 各步骤节点
│   │   ├── normalize-input.mjs
│   │   ├── fetch-stock-data.mjs
│   │   ├── search-news.mjs
│   │   ├── analyze-sentiment.mjs
│   │   ├── score-stocks.mjs
│   │   └── generate-report.mjs
│   ├── tools/                   # 外部服务封装
│   │   ├── yahoo-finance.mjs
│   │   └── bocha-search.mjs
│   ├── utils/                   # 通用工具
│   │   ├── normalize-input.mjs
│   │   ├── scoring.mjs
│   │   ├── report-generation.mjs
│   │   ├── llm.mjs
│   │   └── streaming-response.mjs
│   └── __tests__/               # 单元测试
├── web/                         # 前端（Vite root）
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # 主页面
│       ├── api.js               # API 客户端（含 SSE 解析）
│       └── styles.css
├── docs/
│   ├── FLOW.md
│   └── DEVELOPMENT.md
├── vite.config.js
├── package.json
└── .env.example
```

## 环境配置

复制 `.env.example` 为 `.env`：

```env
PORT=3333
OPENAI_API_KEY=              # LLM，不填则情绪/研报走本地降级
OPENAI_BASE_URL=             # 可选，兼容通义等 OpenAI 格式 API
OPENAI_MODEL=qwen-plus       # 默认 gpt-4o-mini
BOCHA_API_KEY=               # 博查新闻搜索，不填则跳过
YAHOO_FINANCE_PROXY=http://127.0.0.1:7078  # 国内访问 Yahoo 时建议配置
```

## 开发与运行

| 命令 | 说明 |
|------|------|
| `npm run dev` | 并发启动后端（3333）和前端（5177） |
| `npm run dev:server` | 仅后端，带 `--watch` 热重载 |
| `npm run dev:web` | 仅前端 Vite dev server |
| `npm run build` | 前端打包到 `dist/` |
| `npm start` | 生产模式：Express 提供 API + 静态资源 |
| `npm test` | 运行 `server/` 下所有 `*.test.mjs` |

开发时 Vite 将 `/api` 代理到 `http://localhost:3333`（见 `vite.config.js`）。

## 核心设计

### 双执行路径

项目维护两套等价的执行路径，节点逻辑共用：

| 路径 | 入口 | 用途 |
|------|------|------|
| LangGraph | `server/graph.mjs` → `recommendationGraph.invoke()` | 同步 API `/api/recommend`，适合脚本/测试 |
| 手动编排 | `server/recommendation-stream.mjs` → `runRecommendationStream()` | 流式 API `/api/recommend/stream`，支持 SSE 进度与研报流 |

流式路径前 5 步与 LangGraph 节点一一对应；第 6 步研报通过 `streamReportMarkdown()` 单独流式输出，不经过 LangGraph 的 `generate_report` 节点。

### Node 编写约定

每个 node 是一个 async 函数，签名：

```javascript
export async function someNode(state) {
  // 读取 state 中的字段
  // 返回需要合并到 state 的局部更新对象
  return { someField: value, errors: [...] };
}
```

约定：

- 只返回**变更字段**，不返回完整 state
- `errors` 数组在各步骤间**累积追加**，不覆盖
- 外部调用失败时写入 `errors` 或 `riskFlags`，尽量不抛异常中断整条链路
- 工具层（`tools/`）负责 I/O 和降级；node 层负责组装 state

### GraphState

使用 LangGraph `Annotation` 定义，所有字段 reducer 为 `replace`（后写覆盖）：

```javascript
// server/state.mjs
export const GraphState = Annotation.Root({
  tickers, tickerText, theme,
  stocks, candidates, ranking,
  reportMarkdown, errors,
});
```

## API 参考

### `GET /api/health`

健康检查。

```json
{ "ok": true }
```

### `POST /api/recommend`

同步推荐，一次性返回完整结果。

**请求体：**

```json
{
  "tickerText": "NVDA, AMD, TSM",
  "theme": "AI 芯片股"
}
```

也可用 `tickers` 数组代替 `tickerText`。

**响应：**

```json
{
  "tickers": ["NVDA", "AMD", "TSM"],
  "theme": "AI 芯片股",
  "ranking": [ /* 排序后的推荐项 */ ],
  "reportMarkdown": "# ...",
  "errors": []
}
```

### `POST /api/recommend/stream`

流式推荐，返回 `text/event-stream`。

**请求体：** 同 `/api/recommend`

**SSE 事件：**

```
event: progress
data: {"step":"normalize_input","status":"running"}

event: metadata
data: {"tickers":["NVDA","AMD"],"theme":"AI 芯片股"}

event: ranking
data: {"ranking":[...],"errors":[]}

event: report_delta
data: ## 推荐结论

event: done
data: {"tickers":[...],"theme":"...","ranking":[...],"reportMarkdown":"...","errors":[]}
```

前端解析逻辑见 `web/src/api.js` 的 `requestRecommendationStream()`。

## 关键模块说明

### 行情 `yahoo-finance.mjs`

- 优先调用 Yahoo Chart API（轻量、快）
- 失败时 fallback 到 `yahoo-finance2.quote()`
- 支持 `YAHOO_FINANCE_PROXY` 代理（`undici.ProxyAgent`）
- 返回统一结构；失败时 `error` 字段有值，不抛异常

### 新闻 `bocha-search.mjs`

- 调用 `https://api.bochaai.com/v1/web-search`
- 无 API Key 时返回空 `items` + `warning`，不中断流程
- 查询词：`{ticker} stock latest news {theme}`，时间范围 `oneWeek`

### LLM `llm.mjs`

- `createChatModel()`：无 `OPENAI_API_KEY` 时返回 `null`
- `extractText()`：从 LangChain 消息对象提取文本
- `parseJsonObject()`：从 LLM 输出中提取 JSON（支持 markdown fence）

### 打分 `scoring.mjs`

纯函数 `scoreCandidates(candidates)`，无外部依赖，便于单测。

评级阈值：

| 分数 | 评级 |
|------|------|
| ≥ 75 | 强烈关注 |
| ≥ 65 | 关注 |
| ≥ 50 | 谨慎关注 |
| < 50 | 暂不推荐 |

### 研报 `report-generation.mjs`

- `streamReportMarkdown(state)`：async generator，逐块 yield Markdown
- `generateReportMarkdown(state)`：收集全部 chunk 返回完整字符串
- LLM 不可用时 yield `fallbackReport()` 模板内容
- 支持 `model.stream()` 真流式；不支持时 invoke 后分块模拟

## 扩展指南

### 新增 Agent 步骤

1. 在 `server/nodes/` 创建新 node 文件
2. 在 `server/graph.mjs` 中 `addNode` 并插入边
3. 在 `server/recommendation-stream.mjs` 的 `steps` 数组中添加对应项
4. 如需前端进度展示，在 `web/src/App.jsx` 的 `stepLabels` 中追加
5. 在 `server/state.mjs` 中声明新 state 字段（如需要）

### 替换数据源

实现新的 tool 文件（如 `server/tools/xxx.mjs`），保持与现有 tool 相同的返回结构，然后在对应 node 中切换 import。

### 调整评分权重

修改 `server/utils/scoring.mjs` 中 `scoreCandidates()` 的加权公式和 `ratingFor()` 阈值。已有测试文件 `scoring.test.mjs` 可一并更新。

### 切换前端为同步 API

在 `App.jsx` 中将 `requestRecommendationStream` 替换为 `requestRecommendation`，移除进度条和流式研报相关 state。

## 测试

```bash
npm test
```

测试文件分布：

| 文件 | 覆盖 |
|------|------|
| `server/utils/normalize-input.test.mjs` | 股票代码解析 |
| `server/utils/scoring.test.mjs` | 打分逻辑 |
| `server/__tests__/analyze-sentiment.test.mjs` | 情绪分析（含降级） |
| `server/__tests__/report-generation.test.mjs` | 研报生成（含降级） |
| `server/__tests__/recommendation-stream.test.mjs` | 流式编排 |
| `server/__tests__/streaming-response.test.mjs` | SSE 编码 |

`runRecommendationStream` 支持注入 `nodes` 和 `reportStreamer`，便于测试时 mock 外部依赖：

```javascript
await runRecommendationStream(input, {
  send: mockSend,
  nodes: { normalizeInputNode: mockNormalize, /* ... */ },
  reportStreamer: async function* () { yield "test"; },
});
```

## 常见问题

### 流式接口 404

前端报错「流式推荐接口不可用，请重启后端服务」。确认后端已启动且包含 `/api/recommend/stream` 路由；开发模式需同时运行 `npm run dev:server`。

### Yahoo 行情获取失败

国内网络通常需要配置 `YAHOO_FINANCE_PROXY`。Chart API 和 quote API 均失败时，该股票 `error` 字段有值，打分会降权并记入 `riskFlags`。

### LLM 返回非 JSON

`analyze-sentiment` 节点 catch 后自动降级到关键词启发式，并在 `errors` 中记录。研报生成失败时降级到 `fallbackReport()` 模板。

### LangGraph 与 stream 行为不一致

两套路径共用 node 函数，但 stream 路径的研报步骤不走 `generateReportNode`，而是直接调用 `streamReportMarkdown()`。修改研报逻辑时两处需同步关注。

## 技术选型说明

| 选择 | 原因 |
|------|------|
| LangGraph | 课程/demo 场景下清晰表达 Agent 流水线，便于教学和后续加条件分支 |
| 手动 stream 编排 | LangGraph 原生 stream 对「逐步进度 + 研报 token 流」的组合支持较重，手动编排更直观 |
| 规则打分 + LLM 情绪 | 分数可解释、可单测；LLM 负责语义理解，规则负责稳定排序 |
| Express 托管前端 | 单进程部署简单，`npm start` 即可演示 |

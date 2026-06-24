# Skill + MCP 增强方案

## 目标

在保留 Yahoo Finance / 东方财富直连作为 fallback 的前提下，通过 Skill 增强投研流程、通过 MCP 增强行情与深度分析能力。

## 架构

```
Agent (DeepAgents)
  ├── Skills: stock-research / equity-report-writer / china-a-share-analysis / stock-analyst
  ├── Tools: 现有 LangChain 工具 + 可选 MCP 深度分析工具
  └── 行情链路:
        getStockSnapshot()
          ├── [优先] MCP stock-sdk-mcp (MCP_QUOTE_ENABLED=true)
          └── [fallback] 东方财富(A/HK) / Yahoo(美股)
```

## Phase 1 — Skill 增强

| Skill | 来源 | 作用 |
|-------|------|------|
| `china-a-share-analysis` | 项目定制 | A 股基本面分析框架，配合现有 ranking 约束 |
| `stock-analyst` | 改编自 stock-sdk-mcp | 技术面/资金面深度分析（需 MCP 工具） |
| `stock-research` | 更新 | 路由：A 股走 china-a-share，深度分析走 stock-analyst |

## Phase 2 — MCP 后端集成

- 依赖：`@modelcontextprotocol/sdk`、`stock-sdk-mcp`（已安装）
- `server/mcp/mcp-client-pool.mjs` — 单例 MCP 客户端，stdio 连接 stock-sdk-mcp
- `server/mcp/stock-sdk-quote.mjs` — 调用 `get_quotes_by_query` 并映射为统一 snapshot
- `server/tools/quote-provider.mjs` — 分层行情入口
- `server/mcp/mcp-langchain-tools.mjs` — 可选 `analyze_stock` 等深度工具

## 环境变量

```env
MCP_QUOTE_ENABLED=true          # 启用 MCP 行情（默认 false）
MCP_QUOTE_TIMEOUT_MS=15000      # MCP 调用超时
MCP_ANALYSIS_ENABLED=true       # 向 Agent 注入 MCP 深度分析工具
```

## 成功标准

- [ ] Skills 可被 DeepAgents 加载，A 股任务触发 china-a-share-analysis
- [ ] MCP 启用时 getStockSnapshot 优先走 stock-sdk-mcp，失败自动 fallback
- [ ] 现有测试全部通过，新增 quote-provider / mapper 单测
- [ ] MCP 未启用时行为与改造前一致

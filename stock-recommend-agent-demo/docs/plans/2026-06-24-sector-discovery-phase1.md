# 第一期：A 股板块发现 + 成分股调研

## 目标

用户输入「最近 A 股有哪些值得关注的方向」类问题时：

1. 通过 MCP 拉取 **行业/概念板块** 列表，按涨跌幅规则排序
2. 选取 Top 3 领域，各取 1–2 只成分股（合计 ≤5）
3. 写入 `research_targets`，走现有 **market-researcher → quant-analyst → 报告** 流程

## 任务清单

| 步骤 | 任务 | 文件 |
|------|------|------|
| 1 | 环境变量 `MCP_SECTOR_ENABLED` | `server/mcp/mcp-config.mjs`, `.env.example` |
| 2 | MCP 板块响应解析 | `server/mcp/mcp-board-parse.mjs` |
| 3 | 领域发现核心逻辑 | `server/mcp/sector-discovery.mjs` |
| 4 | 发现意图识别 | `server/utils/discovery-intent.mjs` |
| 5 | 流式入口预发现 + SSE | `server/agent/stream-events.mjs` |
| 6 | Agent 工具（可选手动重跑） | `server/agent/sector-discovery-tool.mjs` |
| 7 | Skill + 主 Agent Prompt | `skills/sector-discovery/SKILL.md`, `equity-desk-agent.mjs` |
| 8 | 单测 | `server/__tests__/sector-discovery.test.mjs` |
| 9 | 前端示例话术 | `web/src/App.jsx` |

## 不在第一期

- 基金推荐 / 基金 ranking
- 美股行业发现
- 板块动量 + 新闻情绪融合

## 环境变量

```env
MCP_QUOTE_ENABLED=true      # MCP 客户端（行情）
MCP_SECTOR_ENABLED=true     # 板块发现（依赖同一 MCP 进程）
```

## 成功标准

- [x] 「A 股最近有哪些值得关注的方向」能自动发现 3 个板块 + ≤5 只股票并完成 ranking
- [x] 未启用 `MCP_SECTOR_ENABLED` 时提示用户开启，不静默 fallback
- [x] 单测覆盖板块过滤、成分股选取、意图识别

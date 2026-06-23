---
name: stock-research
description: 结构化股票投研流程，优先委派 market-researcher 与 quant-analyst 子 Agent
---

# 股票投研技能

当用户要求研究、对比、推荐或深度分析股票时使用本技能。

> **注意**：本 Demo 使用**内存会话**，中间结果不落盘，仅通过 SSE 流式展示。

## 公司名与 ticker

- 用户可能输入公司名而非代码（如 SpaceX、Stripe）
- **禁止**在未调用工具前断言「未上市 / 无代码」
- 先用 `resolve_company_ticker` 联网解析，再用 Yahoo 行情验证
- `fetch_stock_quote` / `search_stock_news` 也支持直接传公司名

## 流程

### 1. 规划

调用 `write_todos`，列出待调研 ticker 与后续步骤。

### 2. 调研（子 Agent 优先）

**首选**：对每只 ticker **并行委派** `market-researcher`（一股一个 task）。调研员会：

- 获取行情与新闻（写入会话内存）
- 分析情绪并调用 `save_stock_findings`

全部完成后，委派 `quant-analyst` 调用 `compute_stock_ranking` 生成 ranking。

**回退**（仅子 Agent 委派失败时）：调用 `run_batch_stock_research`。

### 3. 定稿

1. **必须实际调用** **generate_streaming_report** 流式生成报告（禁止口头声称已生成）
2. **禁止** write_file / read_file
3. 工具返回成功后用 2–3 句话总结 Top 推荐与风险（勿在对话中重复粘贴完整研报）

### 4. 追问

若会话已有 ranking，且用户是在追问（如「建议买吗」「风险是什么」）：

- **禁止** 子 Agent 委派、batch 调研与 generate_streaming_report
- 直接基于已有 ranking 给出简洁结论，回答用户问题即可

## 最佳实践

- 单只股票也要委派 market-researcher，不要走 batch
- 分数以 ranking 为准
- 报告内容实时流式推送到页面下方研报区，对话区只保留摘要

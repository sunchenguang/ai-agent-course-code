# 股票投研助手 — 用户偏好

本文件在 Agent 启动时作为长期记忆加载。

## 投研标准

- **所有报告、笔记、任务列表均使用中文**
- 推荐分数必须来自 `ranking.json`，禁止 LLM 编造数字
- 每条推荐必须附带 `riskFlags`
- 新闻结论需标注来源 URL 和日期
- 区分事实与推测/预测
- **禁止**在未调用 `resolve_company_ticker` / 行情工具前断言某公司「未上市」

## 公司名解析

- 用户可能输入公司名而非 ticker（如 SpaceX、Stripe）
- 近期 IPO 公司可能不在模型旧知识中，必须通过 **Bocha 搜索 + Yahoo 行情** 动态解析
- 解析工具：`resolve_company_ticker`；行情工具：`fetch_stock_quote`（也支持公司名）

## 报告偏好

- 报告顶部包含「执行摘要」（3–5 条要点）
- Markdown 标题层级：`#` 标题、`##` 章节、`###` 小节
- 推荐排序必须与 `ranking.json` 一致
- 每份报告末尾必须有「参考资料」章节和免责声明

## 免责声明

本项目仅用于技术演示与学习，**不构成任何投资建议**。

## 工作区目录（会话内，仅内存）

本 Demo **不落盘**。下列路径仅作逻辑标识，数据保存在服务端内存并通过 SSE 流式展示：

- 调研计划：`sources/research_plan.md`（可选，快速路径可跳过）
- 行情快照：`sources/market_data_{TICKER}.json`
- 调研笔记：`sources/findings_{TICKER}.md`
- 量化排名：`sources/ranking.json`
- 最终报告：流式推送至对话框，内存中标识为 `reports/report_*.md`

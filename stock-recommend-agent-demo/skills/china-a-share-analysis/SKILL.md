---
name: china-a-share-analysis
description: A 股价值投资分析框架——筛选、财报解读、估值与风险，配合 ranking 规则使用
---

# A 股投研分析技能

当用户研究 **A 股**（6 位数字代码、`.SS` / `.SZ` 后缀）时使用本技能，与通用 `stock-research` 配合。

> **注意**：推荐分数仍必须来自 `compute_stock_ranking` / `ranking.json`，本技能只增强分析深度与报告质量。

## 触发条件

- 输入含 A 股代码（如 600519、000001.SZ）
- 用户明确要求 A 股筛选、估值、财报分析
- 主题涉及「A 股」「沪深」「科创板」「创业板」

## 分析框架

### 1. 基本面四维

| 维度 | 关注指标 | 数据来源 |
|------|----------|----------|
| 盈利能力 | ROE、净利率、毛利率趋势 | 行情 PE + 调研笔记 |
| 成长性 | 营收/利润增速（如有 MCP 深度数据） | analyze_stock / 新闻 |
| 估值 | PE、PB、股息率 | fetch_stock_quote |
| 财务健康 | 负债率、现金流（深度分析时） | MCP analyze_stock |

### 2. 市场面

- 涨跌幅、成交量、换手率
- 52 周高低位（MCP 或行情快照）
- 北向/主力资金（MCP 启用时可用 `get_stock_fund_flow_history`）

### 3. 风险清单（必须写入 riskFlags）

- 估值过高（PE > 70）
- 单日剧烈波动（|涨跌幅| > 8%）
- 行情数据缺失或不完整
- 财务异常信号（应收激增、现金流背离等，需新闻或 MCP 佐证）

## 与标准流程的配合

1. 仍按 `stock-research` 委派 market-researcher → quant-analyst
2. A 股可在调研笔记中补充：行业地位、估值分位、政策风险
3. 若 `MCP_ANALYSIS_ENABLED`，调研员可调用 `mcp_analyze_stock` 获取 K 线/资金流
4. 报告撰写遵循 `equity-report-writer`，A 股额外增加「估值与行业对比」小节

## 输出规范

- 全文中文，代码保留 6 位数字或 `.SS`/`.SZ`
- 区分**事实**（有来源）与**推测**（标注「基于…推测」）
- 末尾免责声明：仅供学习演示，不构成投资建议

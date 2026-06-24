---
name: stock-analyst
description: 股票技术面与资金面深度分析——K 线、指标、资金流、北向持仓（需 MCP 深度工具）
---

# 股票技术分析专家

当用户或任务需要 **深度技术面/资金面分析**（不仅是简单行情快照）时使用本技能。

## 前置条件

- 服务端已启用 `MCP_ANALYSIS_ENABLED=true`
- Agent 可用工具：`mcp_analyze_stock`、`mcp_get_kline_with_indicators`

若 MCP 未启用，仅基于 `fetch_stock_quote` 与新闻做简要分析，并说明「深度指标数据不可用」。

## 适用场景

- 「分析 XXX 的技术走势」
- 「XXX 的 MACD / 支撑位 / 压力位」
- 「主力资金是否在流入」
- 单股深度调研（在 market-researcher 完成基础调研后，主 Agent 可选触发）

## 执行步骤

### 1. 获取全景数据

调用 `mcp_analyze_stock`，传入股票代码与研究周期：

```json
{ "symbol": "600519", "period": "daily" }
```

返回含：K 线指标（MA/MACD/KDJ/RSI/BOLL）、当日资金流、北向持仓、分红、`dataStatus`。

### 2. 技术解读

- **趋势**：MA5/10/20/60 排列，金叉/死叉
- **MACD**：DIF/DEA 交叉，柱体放大/缩小，背离
- **KDJ/RSI**：超买超卖区间
- **布林带**：价格相对上中下轨位置

### 3. 资金面

- 主力净流入趋势（近 5/10 日）
- 北向持仓变化（A 股）

### 4. 输出结构

```markdown
## 技术分析摘要：{名称} ({代码})

### 趋势与指标
...

### 资金面
...

### 综合判断（非投资建议）
...

### 数据局限
...
```

## 约束

- 技术分析结论**不得**覆盖 `ranking.json` 的推荐分
- 深度分析结果写入调研笔记或报告「技术面补充」小节
- 必须标注数据来源（MCP/stock-sdk-mcp）

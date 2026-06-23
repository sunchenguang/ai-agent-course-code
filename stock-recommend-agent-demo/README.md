# AI 股票投研助手 Demo

基于 DeepAgents 的多 Agent 股票投研演示，对齐 `deep-research-assistant` 架构。支持 **Agent 投研模式**（默认）与 **经典 6 步流水线**对照。

输入研究任务（自然语言或股票池），主 Agent 规划任务、委派调研员与量化分析师、编辑审阅，产出可解释推荐分与中文研报。

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（Agent 模式需 OPENAI_API_KEY）
cp .env.example .env

# 开发模式：同时启动后端 API 和前端页面
npm run dev
```

- 前端页面：http://localhost:5177（默认 **Agent 投研** Tab）
- 后端 API：http://localhost:3333

生产部署：

```bash
npm run build   # 前端打包到 dist/
npm start       # Express 同时提供 API 和静态资源
```

## 文档

| 文档 | 说明 |
|------|------|
| [docs/DEMO.md](./docs/DEMO.md) | 演示指南（架构图 + 现场演示脚本） |
| [docs/DEMO-ORAL.md](./docs/DEMO-ORAL.md) | 口头讲解稿（约 3 分钟） |
| [docs/AGENT-ARCHITECTURE.md](./docs/AGENT-ARCHITECTURE.md) | DeepAgents 多 Agent 架构与 API |
| [docs/FLOW.md](./docs/FLOW.md) | 经典流水线业务流程 |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 开发者指南 |

## 技术栈

- **Agent**：DeepAgents + 子 Agent（market-researcher / quant-analyst / editor）
- **经典模式**：LangGraph 固定流水线
- **LLM**：OpenAI 兼容 API
- **行情**：Yahoo Finance
- **新闻**：博查 AI 搜索 API
- **后端**：Express 5
- **前端**：React 19 + Vite 7

## 免责声明

本项目仅用于技术演示与学习，不构成任何投资建议。

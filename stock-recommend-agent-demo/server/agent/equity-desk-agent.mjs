import path from "node:path";
import dedent from "dedent";
import { tool } from "langchain";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";

import { runBatchStockResearch } from "./batch-research.mjs";
import { computeRankingFromSessionMemory } from "./ranking-from-workspace.mjs";
import { filterTickersToResearchTargets, readResearchTargetTickers } from "./research-targets.mjs";
import { createStreamingReportTool } from "./streaming-report-tool.mjs";
import { createDiscoverHotSectorsTool } from "./sector-discovery-tool.mjs";
import {
  createResolveCompanyTickerTool,
  createSaveFindingsTool,
  createSessionFetchQuoteTool,
  createSessionSearchNewsTool,
} from "./session-stock-tools.mjs";
import {
  ensureSessionWorkspace,
  getSessionVirtualBase,
  projectDir,
  readRankingIfExists,
  setSessionRanking,
} from "./session-workspace.mjs";
import { formatResearchTargetHint } from "../utils/company-ticker.mjs";
import { createMcpAnalysisTools } from "../mcp/mcp-langchain-tools.mjs";
import { isMcpSectorEnabled } from "../mcp/mcp-config.mjs";

function createBatchResearchTool(sessionId) {
  return tool(
    async ({ tickers, theme }) => {
      const allowed = readResearchTargetTickers(sessionId);
      const scopedTickers = filterTickersToResearchTargets(tickers ?? [], allowed);
      const result = await runBatchStockResearch(sessionId, {
        tickers: scopedTickers,
        theme: theme ?? "",
      });
      return JSON.stringify(result, null, 2);
    },
    {
      name: "run_batch_stock_research",
      description:
        "批量调研股票（回退路径）：并行获取行情与新闻、本地情绪分析，结果保存在会话内存并生成 ranking。仅当子 Agent 委派失败时使用。",
      schema: z.object({
        tickers: z.array(z.string().min(1)).min(1).max(5).describe("股票代码列表，如 NVDA、600519.SS"),
        theme: z.string().optional().describe("研究主题，可选"),
      }),
    },
  );
}


function createComputeRankingTool(sessionId) {
  return tool(
    async ({ theme }) => {
      const ranking = computeRankingFromSessionMemory(sessionId, { theme: theme ?? "" });
      setSessionRanking(sessionId, ranking);
      return JSON.stringify(ranking, null, 2);
    },
    {
      name: "compute_stock_ranking",
      description: "读取会话内存中的调研数据，按规则引擎计算推荐分。",
      schema: z.object({
        theme: z.string().optional().describe("研究主题，可选"),
      }),
    },
  );
}

function buildMarketResearcherSubAgent(sessionId, sessionBase) {
  return {
    name: "market-researcher",
    description: "调研单只股票：获取行情、搜索新闻、分析情绪并保存到会话。每次只负责一只股票。",
    systemPrompt: dedent`
      你是一名股票市场调研员，负责调研**一只**分配给你的股票。

      ## 会话上下文（内存，不落盘）

      会话标识：${sessionBase}

      ## 工作流程（必须按顺序完成）

      1. 若 task 已给出 **6 位 A 股代码**（如 002240、688352），**直接**用该代码调用 fetch_stock_quote，**不要**调用 resolve_company_ticker
      2. 若 task 给的是公司名，也优先用 task 中的代码；仅当 task 无代码时再调用 resolve_company_ticker
      3. 调用 fetch_stock_quote 一次（支持公司名或 ticker，会自动解析并验证行情）
      4. 调用 search_stock_news 一次（ticker 优先用 fetch_stock_quote 返回的 sessionTicker，也支持 companyName；新闻写入会话内存）
      5. 根据行情与新闻，判断情绪 label（bullish/neutral/bearish）、confidence、reason（中文）
      6. **必须**调用 save_stock_findings，ticker 使用 fetch_stock_quote 返回的 **sessionTicker**（禁止改用 task 中的其他代码）
      7. 一句话确认完成并停止

      **所有输出必须使用中文**（股票代码可保留英文）
    `,
    tools: [
      createResolveCompanyTickerTool(),
      createSessionFetchQuoteTool(sessionId),
      createSessionSearchNewsTool(sessionId),
      createSaveFindingsTool(sessionId),
      ...createMcpAnalysisTools(),
    ],
  };
}

function buildQuantAnalystSubAgent(sessionId) {
  return {
    name: "quant-analyst",
    description: "读取调研结果，用规则引擎计算推荐分。在 market-researcher 全部完成后使用。",
    systemPrompt: dedent`
      你是一名量化分析师，负责生成**确定性**推荐排名。

      ## 工作流程

      1. **必须**调用 compute_stock_ranking 工具
      2. 一句话总结 Top 3，然后**立即停止**

      所有输出使用中文。
    `,
    tools: [createComputeRankingTool(sessionId)],
  };
}

function buildEditorSubAgent() {
  return {
    name: "editor",
    description: "审阅投研报告草稿的准确性、结构与完整性。只审阅不改内容。",
    systemPrompt: dedent`
      你是一名资深投研编辑，负责**审阅**报告草稿——**不要**亲自改写报告。

      返回简洁的审阅意见和具体、可操作的修改建议。
      **所有输出使用中文。**
    `,
  };
}

function compactRankingForPrompt(ranking = []) {
  return ranking.map((item) => ({
    ticker: item.ticker,
    name: item.name,
    score: item.score,
    rating: item.rating,
    factors: item.factors,
    sentiment: item.sentiment,
    riskFlags: item.riskFlags,
  }));
}

function buildOrchestratorPrompt(
  sessionBase,
  { isFollowUp = false, rankingData = null, researchResolution = null, discoveryMode = false } = {},
) {
  const researchTargetHint = formatResearchTargetHint(researchResolution);
  const scopedTickers = (researchResolution?.tickers ?? [])
    .map((ticker) => String(ticker).trim())
    .filter(Boolean);
  const scopeBlock =
    scopedTickers.length > 0
      ? dedent`
        ## 研究范围（必须严格遵守）

        - 本轮**仅**允许调研：${scopedTickers.join("、")}
        - **禁止**调研上述列表以外的任何 ticker
        - \`resolve_company_ticker\` 返回的 candidates 仅供排查误解析，**不得**据此委派 market-researcher
        - 用户只提到一家公司时，最终 ranking **只能包含 1 只股票**
      `
      : "";
  if (isFollowUp) {
    const rankingBlock = rankingData?.ranking?.length
      ? `\n\n## 已有 ranking 数据\n\`\`\`json\n${JSON.stringify(compactRankingForPrompt(rankingData.ranking), null, 2)}\n\`\`\``
      : "";

    return dedent`
      你是「股票投研助手 / Equity Research Desk」的主 Agent。

      ## 当前会话（内存态，不落盘）

      会话标识：${sessionBase}
      本轮为**追问**：会话中已有 ranking 与研报，用户是在追问或要求解释。${rankingBlock}

      ## 语言要求

      - **所有输出必须使用中文**（股票代码可保留英文）

      ## 追问规则（必须遵守）

      - 本轮**无可用工具**，不要尝试调用任何工具或委派子 Agent
      - **不要**重新生成或复述完整研报
      - 直接基于已有 ranking 与对话上下文作答，约 5–10 句
      - 必须直接回答用户问题（如「建议买吗」→ 明确表态 + 评分依据 + 核心风险 + 免责声明）

      **免责声明**：仅供学习演示，不构成投资建议。
    `;
  }

  return dedent`
    你是「股票投研助手 / Equity Research Desk」的主 Agent，负责协调调研员与量化分析，产出高质量中文投研简报。

    ## 当前会话（内存态，不落盘）

    会话标识：${sessionBase}
    中间结果与报告仅保存在服务端内存，通过 SSE 流式展示给用户。

    ## 语言要求

    - **所有输出必须使用中文**（股票代码可保留英文）
    - 搜索关键词均用中文

    ## 上市状态（以工具检索为准）

    - 近期 IPO / 新上市公司可能不在模型旧知识中，**禁止**凭记忆断言「未上市 / 无股票代码」
    - 用户输入**公司名**时，先调用 resolve_company_ticker 或委派 market-researcher（其会自动解析）
    - 只有在解析与行情验证都失败后，才可说明「暂未找到可交易 ticker」

    ${researchTargetHint ? `\n${researchTargetHint}\n` : ""}
    ${discoveryMode ? `\n## 板块发现模式\n\n- 本轮为**领域发现**任务，研究范围已由 MCP 板块数据或 discover_hot_sectors 工具确定\n- 向用户简要说明选中的板块与成分股后，按标准流程委派 market-researcher\n- 报告须包含「领域概览」小节\n- **禁止**凭记忆编造未在发现结果中的板块或股票\n` : ""}
    ${scopeBlock ? `\n${scopeBlock}\n` : ""}

    ## 标准流程（优先委派子 Agent）

    1. **解析** — 若有公司名或未识别 ticker，调用 resolve_company_ticker；或依赖下方解析提示
    2. **规划** — write_todos 列出待调研 ticker 与步骤
    3. **调研** — 对每只 ticker **并行委派** market-researcher（一股一个 task）
    4. **量化** — 全部调研员完成后，委派 quant-analyst 调用 compute_stock_ranking
    5. **定稿** — **必须实际调用** generate_streaming_report 工具流式生成报告（禁止 write_file）
    6. generate_streaming_report 返回成功后，用 2–3 句话总结 Top 推荐与核心风险（摘要即可，勿在对话中重复粘贴完整研报）

    ## 工具约束

    - **禁止** write_file / read_file / edit_file（本 Demo 不使用磁盘工作区）
    - 报告**必须**通过 generate_streaming_report 工具生成；**禁止**在未调用该工具时口头声称「报告已生成/正在推送」
    - **优先** task 委派子 Agent，不要直接调用 run_batch_stock_research

    ## 委派规则

    - 每只股票单独委派 market-researcher，task description 中写明 ticker 与研究主题
    - 所有 market-researcher 完成后再委派 quant-analyst
    - 默认跳过 editor
    - **仅当**子 Agent 委派多次失败或会话中仍无 ranking 时，才回退 run_batch_stock_research

    ## 完成时告知用户

    - Top 推荐与核心风险摘要
    - 数据局限或信息缺口

    **免责声明**：仅供学习演示，不构成投资建议。
  `;
}

export function createEquityDeskAgent(
  sessionId,
  { emit, isFollowUp = false, researchResolution = null, discoveryMode = false } = {},
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("未设置 OPENAI_API_KEY 环境变量");
  }

  ensureSessionWorkspace(sessionId);
  const sessionBase = getSessionVirtualBase(sessionId);
  const rankingData = isFollowUp ? readRankingIfExists(sessionId) : null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;

  const chatModel = new ChatOpenAI({
    model,
    temperature: 0,
    apiKey,
    useResponsesApi: false,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });

  const tools = [];
  if (!isFollowUp) {
    tools.push(createResolveCompanyTickerTool());
    if (isMcpSectorEnabled()) {
      tools.push(createDiscoverHotSectorsTool(sessionId));
    }
    tools.push(createBatchResearchTool(sessionId));
    if (typeof emit === "function") {
      tools.push(createStreamingReportTool(sessionId, emit));
    }
  }

  return createDeepAgent({
    model: chatModel,
    systemPrompt: buildOrchestratorPrompt(sessionBase, {
      isFollowUp,
      rankingData,
      researchResolution,
      discoveryMode,
    }),
    memory: [path.join(projectDir, "AGENTS.md")],
    skills: isFollowUp ? [] : ["/skills/"],
    tools,
    subagents: isFollowUp
      ? []
      : [
          buildMarketResearcherSubAgent(sessionId, sessionBase),
          buildQuantAnalystSubAgent(sessionId),
          buildEditorSubAgent(),
        ],
  });
}

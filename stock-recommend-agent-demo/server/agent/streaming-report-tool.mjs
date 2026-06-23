import { tool } from "langchain";
import { z } from "zod";

import { streamReportMarkdown } from "../utils/report-generation.mjs";
import { readRankingIfExists, setSessionReport } from "./session-memory.mjs";

function slugify(value) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "research"
  );
}

export async function runStreamingSessionReport(sessionId, emit, { theme, slug } = {}) {
  const rankingData = readRankingIfExists(sessionId);
  if (!rankingData?.ranking?.length) {
    throw new Error("未找到 ranking 数据，请先完成调研与量化");
  }

  const reportSlug = slugify(slug ?? rankingData.ranking[0]?.ticker);
  const virtualPath = `reports/report_${reportSlug}.md`;

  emit("report_start", { path: virtualPath });
  emit("phase", { phase: "report", status: "running" });

  const state = {
    theme: theme?.trim() || rankingData.theme || `${reportSlug} 投研简报`,
    ranking: rankingData.ranking,
    errors: [],
  };

  let reportMarkdown = "";
  for await (const chunk of streamReportMarkdown(state)) {
    reportMarkdown += chunk;
    emit("report_delta", chunk);
  }

  setSessionReport(sessionId, reportMarkdown, virtualPath);

  emit("report_ready", { reportMarkdown });
  emit("phase", { phase: "report", status: "completed" });
  emit("artifact", { kind: "report", label: "投研研报" });

  return reportMarkdown;
}

export function createStreamingReportTool(sessionId, emit) {
  return tool(
    async ({ theme, slug }) => {
      const reportMarkdown = await runStreamingSessionReport(sessionId, emit, { theme, slug });
      return `已流式生成报告（${reportMarkdown.length} 字），仅保存在当前会话内存中`;
    },
    {
      name: "generate_streaming_report",
      description:
        "基于 ranking 数据流式生成中文投研 Markdown 报告，通过 SSE 实时展示，不落盘。",
      schema: z.object({
        theme: z.string().optional().describe("报告主题"),
        slug: z.string().optional().describe("报告标识，如 PDD"),
      }),
    },
  );
}

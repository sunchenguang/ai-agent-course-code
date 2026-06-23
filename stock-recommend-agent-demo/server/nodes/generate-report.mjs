import { generateReportMarkdown } from "../utils/report-generation.mjs";

export async function generateReportNode(state) {
  return { reportMarkdown: await generateReportMarkdown(state) };
}

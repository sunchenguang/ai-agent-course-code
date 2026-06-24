import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, "../..");

function readBool(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function readInt(value, defaultValue) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export const mcpConfig = {
  quoteEnabled: readBool(process.env.MCP_QUOTE_ENABLED, false),
  analysisEnabled: readBool(process.env.MCP_ANALYSIS_ENABLED, false),
  sectorEnabled: readBool(process.env.MCP_SECTOR_ENABLED, false),
  quoteTimeoutMs: readInt(process.env.MCP_QUOTE_TIMEOUT_MS, 15_000),
  sectorTimeoutMs: readInt(process.env.MCP_SECTOR_TIMEOUT_MS, 30_000),
  serverEntry: path.resolve(projectRoot, "node_modules/stock-sdk-mcp/dist/index.js"),
};

export function isMcpQuoteEnabled() {
  return mcpConfig.quoteEnabled;
}

export function isMcpAnalysisEnabled() {
  return mcpConfig.analysisEnabled;
}

export function isMcpSectorEnabled() {
  return mcpConfig.sectorEnabled;
}

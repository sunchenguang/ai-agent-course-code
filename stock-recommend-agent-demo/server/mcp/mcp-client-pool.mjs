import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { mcpConfig } from "./mcp-config.mjs";

let clientPromise = null;
let connectGeneration = 0;

function createTransport() {
  return new StdioClientTransport({
    command: process.execPath,
    args: [mcpConfig.serverEntry],
    cwd: path.resolve(path.dirname(mcpConfig.serverEntry), ".."),
    stderr: "pipe",
  });
}

async function connectClient() {
  const generation = ++connectGeneration;
  const transport = createTransport();
  const client = new Client({ name: "stock-recommend-agent-demo", version: "0.1.0" });
  await client.connect(transport);
  if (generation !== connectGeneration) {
    await client.close().catch(() => {});
    throw new Error("MCP client superseded during connect");
  }
  return client;
}

export async function getMcpClient() {
  if (!clientPromise) {
    clientPromise = connectClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function callMcpTool(name, args = {}, { timeoutMs = mcpConfig.quoteTimeoutMs } = {}) {
  const client = await getMcpClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await client.callTool({ name, arguments: args }, undefined, {
      signal: controller.signal,
    });
    if (result.isError) {
      const message =
        result.content?.map((item) => item.text ?? "").join("\n").trim() || `MCP tool ${name} failed`;
      throw new Error(message);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function resetMcpClient() {
  connectGeneration += 1;
  if (!clientPromise) return;
  const current = clientPromise;
  clientPromise = null;
  try {
    const client = await current;
    await client.close();
  } catch {
    // ignore close errors during reset
  }
}

export async function closeMcpClient() {
  await resetMcpClient();
}

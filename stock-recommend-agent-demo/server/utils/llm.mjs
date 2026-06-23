import { ChatOpenAI } from "@langchain/openai";

export function createChatModel({ temperature = 0.2 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    temperature,
    apiKey,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}

export function extractText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === "string" ? part : part.text ?? ""))
      .join("");
  }
  return String(message.content ?? "");
}

export function parseJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  return JSON.parse(candidate);
}

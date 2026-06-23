const stores = new Map();

function sanitizeSessionId(sessionId) {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("无效的 sessionId");
  return safe;
}

function createEmptyStore() {
  return {
    files: new Map(),
    ranking: null,
    reportMarkdown: "",
  };
}

function normalizeRelativePath(relativePath) {
  return String(relativePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^workspace\/sessions\/[^/]+\//, "");
}

export function getSessionVirtualBase(sessionId) {
  return `/workspace/sessions/${sanitizeSessionId(sessionId)}`;
}

export function ensureSessionStore(sessionId) {
  const id = sanitizeSessionId(sessionId);
  if (!stores.has(id)) {
    stores.set(id, createEmptyStore());
  }
  return stores.get(id);
}

export function resetSessionStore(sessionId) {
  const id = sanitizeSessionId(sessionId);
  stores.set(id, createEmptyStore());
  return stores.get(id);
}

export function writeSessionFile(sessionId, relativePath, content) {
  const store = ensureSessionStore(sessionId);
  const path = normalizeRelativePath(relativePath);
  store.files.set(path, String(content));
  return path;
}

export function readSessionFile(sessionId, relativePath) {
  const store = ensureSessionStore(sessionId);
  return store.files.get(normalizeRelativePath(relativePath)) ?? null;
}

export function listSessionFiles(sessionId, prefix = "") {
  const store = ensureSessionStore(sessionId);
  const normalizedPrefix = normalizeRelativePath(prefix);
  return [...store.files.keys()].filter((filePath) => filePath.startsWith(normalizedPrefix));
}

export function setSessionRanking(sessionId, ranking) {
  const store = ensureSessionStore(sessionId);
  store.ranking = ranking;
  writeSessionFile(sessionId, "sources/ranking.json", JSON.stringify(ranking, null, 2));
  return ranking;
}

export function readRankingIfExists(sessionId) {
  const store = ensureSessionStore(sessionId);
  if (store.ranking) return store.ranking;
  const raw = readSessionFile(sessionId, "sources/ranking.json");
  if (!raw) return null;
  try {
    store.ranking = JSON.parse(raw);
    return store.ranking;
  } catch {
    return null;
  }
}

export function setSessionReport(sessionId, markdown, relativePath) {
  const store = ensureSessionStore(sessionId);
  store.reportMarkdown = String(markdown ?? "");
  if (relativePath) {
    writeSessionFile(sessionId, relativePath, store.reportMarkdown);
  }
  return store.reportMarkdown;
}

export function readLatestReport(sessionId) {
  const store = ensureSessionStore(sessionId);
  if (store.reportMarkdown) return store.reportMarkdown;

  const reportFiles = listSessionFiles(sessionId, "reports/").filter((filePath) => filePath.endsWith(".md"));
  if (!reportFiles.length) return "";

  const latest = reportFiles[reportFiles.length - 1];
  const content = readSessionFile(sessionId, latest) ?? "";
  store.reportMarkdown = content;
  return content;
}

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureSessionStore as ensureSessionWorkspace,
  getSessionVirtualBase,
  listSessionFiles,
  readLatestReport,
  readRankingIfExists,
  readSessionFile,
  resetSessionStore as resetSessionWorkspace,
  setSessionRanking,
  setSessionReport,
  writeSessionFile,
} from "./session-memory.mjs";

export const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export {
  ensureSessionWorkspace,
  getSessionVirtualBase,
  listSessionFiles,
  readLatestReport,
  readRankingIfExists,
  readSessionFile,
  resetSessionWorkspace,
  setSessionRanking,
  setSessionReport,
  writeSessionFile,
};

export function getSessionSourcesDir(sessionId) {
  return `${getSessionVirtualBase(sessionId)}/sources`;
}

export function getSessionReportsDir(sessionId) {
  return `${getSessionVirtualBase(sessionId)}/reports`;
}

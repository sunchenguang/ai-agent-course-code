import { scoreCandidates } from "../utils/scoring.mjs";

export async function scoreStocksNode(state) {
  return {
    ranking: scoreCandidates(state.candidates),
  };
}

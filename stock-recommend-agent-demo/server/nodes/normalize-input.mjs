import { normalizeRequestBody } from "../utils/normalize-input.mjs";

export async function normalizeInputNode(state) {
  const normalized = normalizeRequestBody(state);
  return {
    ...normalized,
    errors: [],
  };
}

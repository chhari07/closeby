import "server-only";

// Model IDs + pricing checked via the claude-api skill on 2026-09-22
// (roadmap §2.1: "before writing model code, check the current model names
// and prices"). Haiku 4.5 for cheap/fast text helpers, Sonnet 5 reserved for
// harder reasoning / photo helpers (Step 3's shelf-photo flow — not built
// yet). Update this file, not scattered literals, if pricing changes.
export const AI_MODELS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
} as const;

export type AiModelId = (typeof AI_MODELS)[keyof typeof AI_MODELS];

const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  [AI_MODELS.haiku]: { input: 1.0, output: 5.0 },
  [AI_MODELS.sonnet]: { input: 2.0, output: 10.0 },
};

/** Cost of one call from raw token counts — used to fill aiRuns.costUsd and aiUsage. */
export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICING_USD_PER_MTOK[model];
  if (!price) return 0;
  return (tokensIn / 1_000_000) * price.input + (tokensOut / 1_000_000) * price.output;
}

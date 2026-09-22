import "server-only";
import { nearbyShopsTool, searchProductsTool, orderStatusTool, shopStockTool } from "./lookup";
import { draftCartTool, draftStockListTool, draftOrderAdviceTool } from "./draft";
import { HELPER_TOOLS } from "@/lib/ai/helpers";
import type { AiHelperName } from "@/types/ai";
import type { ToolContext } from "./context";

export type { ToolContext } from "./context";

/**
 * The narrow, per-helper tool surface (roadmap §2.3 / §2.7): a helper only
 * ever sees the handful of tools it's allowed, built fresh per request with
 * `ctx` closed over — the model can never smuggle a different userId/shopId
 * into a tool call, and it cannot reach a tool that isn't in its own list.
 */
export function buildTools(helper: AiHelperName, ctx: ToolContext) {
  const all: Record<string, unknown> = {
    nearbyShops: nearbyShopsTool(),
    searchProducts: searchProductsTool(),
    orderStatus: orderStatusTool(ctx),
    shopStock: shopStockTool(ctx),
    draftCart: draftCartTool(ctx),
    draftStockList: draftStockListTool(ctx),
    draftOrderAdvice: draftOrderAdviceTool(ctx),
  };
  return HELPER_TOOLS[helper].map((name) => all[name]);
}

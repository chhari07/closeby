import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "@/lib/db/client";
import { findOrder, findShop, toProduct } from "@/lib/db/rows";
import { ownsShop } from "@/lib/auth/guards";
import type { ToolContext } from "./context";
import { normalizeStockItems } from "@/lib/ai/stock-items";
import { saveShopIdeas } from "@/lib/shop-ideas";

/**
 * Draft tools (roadmap §2.3 / §2.5). These are the ONLY things the AI is
 * allowed to write, and all they ever write is a `pending` row in
 * `approvals` — never orders/products/shops directly. A human has to
 * Confirm before src/actions/ai.ts's confirmApproval calls a real,
 * already-existing server action (which re-checks price/stock/ownership
 * itself, same as if a human had done it by hand).
 */

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

async function createApproval(
  userId: string,
  shopId: string | undefined,
  type: "draftCart" | "draftStockList" | "draftOrderAdvice",
  draft: unknown,
): Promise<string> {
  const now = Date.now();
  const [row] = await db()`
    insert into approvals (user_id, shop_id, type, draft, status, created_at, expires_at)
    values (${userId}, ${shopId ?? null}, ${type}, ${db().json(draft as never)}, 'pending', ${now}, ${now + APPROVAL_TTL_MS})
    returning id
  `;
  return row!.id as string;
}

export function draftCartTool(ctx: ToolContext) {
  return betaZodTool({
    name: "draftCart",
    description:
      "Save a draft cart for the buyer to review and confirm. Re-checks every item's real stock and price itself.",
    inputSchema: z.object({
      shopId: z.string().trim().min(1).max(80),
      items: z
        .array(
          z.object({
            productId: z.string().trim().min(1).max(80),
            qty: z.number().int().min(1).max(999),
          }),
        )
        .min(1)
        .max(30),
    }),
    run: async ({ shopId, items }) => {
      const shop = await findShop(shopId);
      const shopName = shop?.name;
      if (!shop || shop.status !== "live" || !shopName) {
        return JSON.stringify({ approvalId: null, itemCount: 0, unavailable: items.map((i) => i.productId) });
      }

      const verified: {
        productId: string;
        name: string;
        unit: string;
        price: number;
        qty: number;
        imageUrl: string | null;
      }[] = [];
      const unavailable: string[] = [];
      const productRows = await db()`
        select * from products where shop_id = ${shopId} and id = any(${items.map((i) => i.productId)})
      `;
      const productsById = new Map(productRows.map((r) => [r.id as string, toProduct(r)]));
      for (const item of items) {
        const p = productsById.get(item.productId);
        if (!p || !p.inStock || p.stock < 1) {
          unavailable.push(item.productId);
          continue;
        }
        verified.push({
          productId: item.productId,
          name: p.name,
          unit: p.unit,
          price: p.price,
          qty: Math.min(item.qty, p.stock),
          imageUrl: p.imageUrl ?? null,
        });
      }

      if (verified.length === 0) return JSON.stringify({ approvalId: null, itemCount: 0, unavailable });

      const approvalId = await createApproval(ctx.userId, shopId, "draftCart", {
        shopId,
        shopName,
        items: verified,
      });
      return JSON.stringify({ approvalId, itemCount: verified.length, unavailable });
    },
  });
}

export function draftStockListTool(ctx: ToolContext) {
  return betaZodTool({
    name: "draftStockList",
    description: "Save a draft list of parsed stock-update items for the owner to review before import.",
    inputSchema: z.object({
      shopId: z.string().trim().min(1).max(80),
      items: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(100),
            brand: z.string().trim().max(60).optional(),
            unit: z.string().trim().min(1).max(20),
            category: z.string().trim().min(1).max(40).default("General"),
            price: z.number().positive().max(100000).describe("rupees, decimal"),
            mrp: z.number().positive().max(100000).optional().describe("rupees, as printed on the pack"),
            stock: z.number().int().min(0).max(100000),
            confidence: z.number().min(0).max(1),
          }),
        )
        .min(1)
        .max(50),
    }),
    run: async ({ shopId, items }) => {
      if (shopId !== ctx.shopId) throw new Error("Not your shop");
      const cleaned = normalizeStockItems(items);
      const approvalId = await createApproval(ctx.userId, shopId, "draftStockList", { shopId, items: cleaned });
      return JSON.stringify({ approvalId, itemCount: cleaned.length, items: cleaned });
    },
  });
}

export function draftOrderAdviceTool(ctx: ToolContext) {
  return betaZodTool({
    name: "draftOrderAdvice",
    description: "Save a draft accept/reject recommendation for one order, for the owner to confirm.",
    inputSchema: z.object({
      orderId: z.string().trim().min(1).max(80),
      decision: z.enum(["ACCEPT", "REJECT"]),
      reason: z.string().trim().min(1).max(300),
      confidence: z.number().min(0).max(1),
    }),
    run: async ({ orderId, decision, reason, confidence }) => {
      const order = await findOrder(orderId);
      if (!order) throw new Error("Order not found");
      const owned = await ownsShop(ctx.userId, order.shopId);
      if (!owned) throw new Error("Not your order");

      const approvalId = await createApproval(ctx.userId, order.shopId, "draftOrderAdvice", {
        orderId,
        decision,
        reason,
        confidence,
      });
      return JSON.stringify({ approvalId });
    },
  });
}

/**
 * Step 3.3: the owner's restock / price ideas. Saves them as pending
 * approvals via saveShopIdeas, which drops anything that isn't one of the
 * server's candidates and clamps every number into its allowed range — so
 * whatever the model sends, nothing out of bounds is stored, and nothing
 * changes a product until the owner presses Apply.
 */
export function draftShopIdeasTool(ctx: ToolContext) {
  return betaZodTool({
    name: "draftShopIdeas",
    description: "Save restock / price / slow-item ideas for the owner to review. Only use productIds from the candidate list.",
    inputSchema: z.object({
      ideas: z
        .array(
          z.object({
            productId: z.string().trim().min(1).max(80),
            kind: z.enum(["restock", "price", "slow"]),
            suggestedQty: z.number().int().min(1).max(100000).optional(),
            suggestedPrice: z.number().positive().max(10000000).optional(),
            reason: z.string().trim().min(1).max(300),
          }),
        )
        .max(20),
    }),
    run: async ({ ideas }) => {
      if (ctx.role !== "shop_owner" || !ctx.shopId || !(await ownsShop(ctx.userId, ctx.shopId))) {
        throw new Error("Not your shop");
      }
      const approvalIds = await saveShopIdeas(ctx.userId, ctx.shopId, ideas);
      return JSON.stringify({ saved: approvalIds.length });
    },
  });
}

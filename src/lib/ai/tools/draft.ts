import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { adminDb } from "@/lib/firebase/admin";
import { ownsShop } from "@/lib/auth/guards";
import type { OrderDoc } from "@/types";
import type { ToolContext } from "./context";
import { normalizeStockItems } from "@/lib/ai/stock-items";

/**
 * Draft tools (roadmap §2.3 / §2.5). These are the ONLY things the AI is
 * allowed to write, and all they ever write is a `pending` doc in
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
  const ref = adminDb().collection("approvals").doc();
  const now = Date.now();
  await ref.set({
    userId,
    shopId: shopId ?? null,
    type,
    draft,
    status: "pending",
    createdAt: now,
    expiresAt: now + APPROVAL_TTL_MS,
  });
  return ref.id;
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
      const shopDoc = await adminDb().collection("shops").doc(shopId).get();
      const shopName = shopDoc.data()?.name as string | undefined;
      if (!shopDoc.exists || shopDoc.data()?.status !== "live" || !shopName) {
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
      for (const item of items) {
        const pDoc = await adminDb()
          .collection("shops")
          .doc(shopId)
          .collection("products")
          .doc(item.productId)
          .get();
        const p = pDoc.data();
        if (!pDoc.exists || !p || !p.inStock || p.stock < 1) {
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
      const orderDoc = await adminDb().collection("orders").doc(orderId).get();
      if (!orderDoc.exists) throw new Error("Order not found");
      const order = orderDoc.data() as OrderDoc;
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

import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { adminDb } from "@/lib/firebase/admin";
import { ownsShop } from "@/lib/auth/guards";
import { getNearbyShops } from "@/lib/geo/nearby-shops";
import type { OrderDoc, ProductDoc } from "@/types";
import type { ToolContext } from "./context";

/**
 * Read-only tools (roadmap §2.3). Every one of these returns only fields
 * copied straight out of a real Firestore doc — the model never gets to
 * assert a price, a stock count, or an order status; it can only read one
 * a tool actually fetched. This is what "stops made-up items."
 */

export function nearbyShopsTool() {
  return betaZodTool({
    name: "nearbyShops",
    description: "Find open, live CloseBy shops near a lat/lng, nearest first.",
    inputSchema: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusInM: z.number().min(0).max(20000).default(3000),
    }),
    run: async ({ lat, lng, radiusInM }) => {
      const results = await getNearbyShops({ lat, lng }, radiusInM);
      const shops = results.slice(0, 15).map((r) => ({
        shopId: r.shop.id,
        name: r.shop.name,
        type: r.shop.type,
        distanceInM: Math.round(r.distanceInM),
      }));
      return JSON.stringify({ shops });
    },
  });
}

export function searchProductsTool() {
  return betaZodTool({
    name: "searchProducts",
    description:
      "Search real, in-stock products inside one specific shop by name or alias (Hindi/Hinglish names included).",
    inputSchema: z.object({
      shopId: z.string().trim().min(1).max(80),
      query: z.string().trim().min(1).max(80),
    }),
    run: async ({ shopId, query }) => {
      const snap = await adminDb().collection("shops").doc(shopId).collection("products").limit(300).get();
      const q = query.toLowerCase();
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ProductDoc, "id" | "shopId">) }))
        .filter(
          (p) =>
            p.inStock &&
            (p.name.toLowerCase().includes(q) || (p.aliases ?? []).some((a) => a.toLowerCase().includes(q))),
        )
        .slice(0, 20)
        .map((p) => ({ productId: p.id, name: p.name, unit: p.unit, price: p.price, stock: p.stock }));
      return JSON.stringify({ products: matches });
    },
  });
}

export function orderStatusTool(ctx: ToolContext) {
  return betaZodTool({
    name: "orderStatus",
    description: "Look up the real status of one order — only if the caller has access to it.",
    inputSchema: z.object({ orderId: z.string().trim().min(1).max(80) }),
    run: async ({ orderId }) => {
      const doc = await adminDb().collection("orders").doc(orderId).get();
      if (!doc.exists) return JSON.stringify({ found: false });
      const order = doc.data() as OrderDoc;

      const isBuyer = order.buyerId === ctx.userId;
      const isShop = ctx.role === "shop_owner" && (await ownsShop(ctx.userId, order.shopId));
      if (!isBuyer && !isShop) return JSON.stringify({ found: false });

      return JSON.stringify({
        found: true,
        status: order.status,
        itemCount: order.items.length,
        itemTotal: order.itemTotal,
        createdAt: order.createdAt,
      });
    },
  });
}

export function shopStockTool(ctx: ToolContext) {
  return betaZodTool({
    name: "shopStock",
    description: "List real stock levels for the caller's own shop, lowest stock first.",
    inputSchema: z.object({ shopId: z.string().trim().min(1).max(80) }),
    run: async ({ shopId }) => {
      // Never trust a shopId argument that doesn't match the run's injected
      // context — an owner AI helper can only ever see its own shop's stock.
      if (shopId !== ctx.shopId) return JSON.stringify({ products: [] });
      const snap = await adminDb()
        .collection("shops")
        .doc(shopId)
        .collection("products")
        .orderBy("stock", "asc")
        .limit(100)
        .get();
      const products = snap.docs.map((d) => {
        const p = d.data() as Omit<ProductDoc, "id" | "shopId">;
        return { productId: d.id, name: p.name, unit: p.unit, stock: p.stock, price: p.price };
      });
      return JSON.stringify({ products });
    },
  });
}

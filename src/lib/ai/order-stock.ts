import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { OrderDoc } from "@/types";

export interface OrderStockLine {
  productId: string;
  name: string;
  unit: string;
  ordered: number;
  /** What the shop has right now — 0 if the product is gone or marked out of stock. */
  available: number;
  /** How many more are needed to fill this line; 0 when it's fully covered. */
  shortBy: number;
}

/**
 * Compares every line of an order with the shop's real, current stock. Used
 * by the order helper both as a tool result (so the AI can name what's short)
 * and directly by the API route (so the owner sees exact numbers that never
 * depend on the model reporting them correctly).
 */
export async function checkOrderStock(order: Pick<OrderDoc, "shopId" | "items">): Promise<OrderStockLine[]> {
  const products = adminDb().collection("shops").doc(order.shopId).collection("products");
  const docs = order.items.length ? await adminDb().getAll(...order.items.map((i) => products.doc(i.productId))) : [];
  return order.items.map((item, idx) => {
    const p = docs[idx]?.data();
    const available = p && p.inStock ? Math.max(0, Number(p.stock) || 0) : 0;
    return {
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      ordered: item.qty,
      available,
      shortBy: Math.max(0, item.qty - available),
    };
  });
}

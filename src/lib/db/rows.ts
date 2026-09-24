import "server-only";
import { db, type Tx } from "./client";
import type { Locality, OrderDoc, ProductDoc, ShopDoc, UserDoc } from "@/types";
import type { ApprovalDoc } from "@/types/ai";

/**
 * Row → app type mappers, plus the single-row lookups used all over the
 * server code. Firestore simply left out optional fields that were never
 * set; Postgres returns NULL for them. The mappers drop those NULLs so the
 * app keeps seeing `undefined`, exactly as before.
 */

type Row = Record<string, unknown>;

function withoutNulls<T>(row: Row, keepNull: readonly string[] = []): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null && !keepNull.includes(k)) continue;
    out[k] = v;
  }
  return out as T;
}

export function toShop(row: Row): ShopDoc {
  const shop = withoutNulls<ShopDoc & { orderCount?: number; pendingOrderCount?: number }>(row, ["type"]);
  return { ...shop, itemCount: shop.itemCount ?? 0 };
}

export function toProduct(row: Row): ProductDoc {
  return withoutNulls<ProductDoc>(row, ["imageUrl"]);
}

export function toOrder(row: Row): OrderDoc {
  return withoutNulls<OrderDoc>(row);
}

export function toUser(row: Row): UserDoc & { id: string } {
  return withoutNulls<UserDoc & { id: string }>(row);
}

export function toLocality(row: Row): Locality {
  return row as unknown as Locality;
}

export function toApproval(row: Row): ApprovalDoc & { edited?: boolean } {
  return withoutNulls<ApprovalDoc & { edited?: boolean }>(row, ["shopId"]);
}

type Conn = ReturnType<typeof db> | Tx;

export async function findShop(shopId: string, conn: Conn = db()): Promise<ShopDoc | null> {
  const [row] = await conn`select * from shops where id = ${shopId}`;
  return row ? toShop(row) : null;
}

export async function findProduct(
  shopId: string,
  productId: string,
  conn: Conn = db(),
): Promise<ProductDoc | null> {
  const [row] = await conn`select * from products where id = ${productId} and shop_id = ${shopId}`;
  return row ? toProduct(row) : null;
}

export async function findOrder(orderId: string, conn: Conn = db()): Promise<OrderDoc | null> {
  const [row] = await conn`select * from orders where id = ${orderId}`;
  return row ? toOrder(row) : null;
}

export async function findUser(userId: string, conn: Conn = db()): Promise<(UserDoc & { id: string }) | null> {
  const [row] = await conn`select * from users where id = ${userId}`;
  return row ? toUser(row) : null;
}

export async function listLocalityRows(): Promise<Locality[]> {
  const rows = await db()`select * from localities order by name`;
  return rows.map(toLocality);
}

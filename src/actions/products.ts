"use server";

import { db } from "@/lib/db/client";
import { toProduct } from "@/lib/db/rows";
import { productImageUploadTarget } from "@/lib/supabase/admin";
import { requireUserId as requireAuthedUserId, assertShopOwnership } from "@/lib/auth/guards";
import {
  productSchema,
  productImportItemSchema,
  productImageSchema,
  type ProductInput,
} from "@/lib/validation/product";
import { rupeesToPaise } from "@/lib/money";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { getShopCatalog, invalidateCatalog } from "@/lib/catalog";
import type { ActionResult } from "./types";
import type { ProductDoc } from "@/types";
import { randomUUID } from "node:crypto";

/** Auth + rate limit, same as before — the ownership check (Step 1.9) now
 *  lives in src/lib/auth/guards.ts, shared with src/actions/shops.ts. */
async function requireUserId(): Promise<string> {
  const userId = await requireAuthedUserId();
  const limited = rateLimit("productWrite", userId);
  if (!limited.ok) throw new Error(rateLimitMessage(limited.retryAfterSec));
  return userId;
}

/** The shop's full product list, from the shared cache (see src/lib/catalog.ts). */
export async function getShopProducts(shopId: string): Promise<ProductDoc[]> {
  return getShopCatalog(shopId);
}

/** Stock at or below this counts as "low" for the dashboard warning. */
const LOW_STOCK_THRESHOLD = 3;

/**
 * Step 1.3's "lowStockCount, don't scan the whole catalog" — a bounded,
 * indexed query instead of a stored counter. A stored counter has to be
 * kept in sync by hand at every stock-mutating call site (add, edit,
 * import, bulk toggle, an order reserving/returning stock); a `where`
 * query on `stock` can't drift out of sync the way a manual counter can,
 * and it's just as cheap: one bounded read, not the whole catalog.
 */
export async function getLowStockProducts(
  shopId: string,
  max = 20,
): Promise<ProductDoc[]> {
  const rows = await db()`
    select * from products
    where shop_id = ${shopId} and stock <= ${LOW_STOCK_THRESHOLD}
    order by stock asc
    limit ${max}
  `;
  return rows.map(toProduct);
}

// inStock is derived from stock (see ProductDoc), so a bulk "mark out of
// stock" zeroes stock; a bulk "mark in stock" only needs to touch products
// that are currently at zero, bumping them to a nominal count of 1 — the
// owner can correct the exact number afterward.
export async function bulkSetInStock(
  shopId: string,
  productIds: string[],
  inStock: boolean
): Promise<ActionResult> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);

  const now = Date.now();
  if (!inStock) {
    await db()`
      update products set stock = 0, in_stock = false, updated_at = ${now}
      where shop_id = ${shopId} and id = any(${productIds})
    `;
  } else {
    await db()`
      update products set stock = 1, in_stock = true, last_restocked_at = ${now}, updated_at = ${now}
      where shop_id = ${shopId} and id = any(${productIds}) and stock <= 0
    `;
  }
  invalidateCatalog(shopId);
  return { ok: true };
}

export async function addProduct(
  shopId: string,
  input: ProductInput
): Promise<ActionResult<{ productId: string }>> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const { name, price, unit, category, stock, imageUrl, brand, description, mrp, aliases } = parsed.data;
  const now = Date.now();

  const productId = await db().begin(async (tx) => {
    const [row] = await tx`
      insert into products ${tx({
        shopId,
        name,
        price,
        unit,
        category,
        stock,
        inStock: stock > 0,
        imageUrl: imageUrl ?? null,
        brand: brand || null,
        description: description || null,
        mrp: mrp || null,
        aliases: aliases?.length ? aliases : null,
        lastRestockedAt: stock > 0 ? now : null,
        updatedAt: now,
      })}
      returning id
    `;
    await tx`update shops set item_count = item_count + 1, updated_at = ${now} where id = ${shopId}`;
    return row!.id as string;
  });

  invalidateCatalog(shopId);
  return { ok: true, data: { productId } };
}

export interface BulkImportResult {
  products: ProductDoc[];
  failed: { index: number; error: string }[];
}

/**
 * Bulk add products from an uploaded JSON file, alongside the existing
 * one-at-a-time manual form. Input prices are rupees (same units the
 * manual form collects) — converted to paise here, the single place that
 * conversion happens for imports.
 */
export async function bulkImportProducts(
  shopId: string,
  items: unknown
): Promise<ActionResult<BulkImportResult>> {
  const userId = await requireUserId();
  const importLimit = rateLimit("productImport", userId);
  if (!importLimit.ok) return { ok: false, error: rateLimitMessage(importLimit.retryAfterSec) };
  await assertShopOwnership(userId, shopId);

  if (!Array.isArray(items)) {
    return { ok: false, error: "The file must contain a list of products" };
  }
  if (items.length === 0) {
    return { ok: false, error: "The file has no products in it" };
  }
  if (items.length > 200) {
    return { ok: false, error: "Import is limited to 200 products at a time" };
  }

  const now = Date.now();

  // Validate each row independently so one bad row doesn't sink the whole
  // file — valid rows still get imported, invalid ones are reported back.
  type Row = { id: string; data: Omit<ProductDoc, "id" | "shopId"> };
  const failed: { index: number; error: string }[] = [];
  const rows: Row[] = [];

  items.forEach((item, index) => {
    const parsed = productImportItemSchema.safeParse(item);
    if (!parsed.success) {
      failed.push({ index, error: parsed.error.issues[0]?.message ?? "Invalid product" });
      return;
    }
    rows.push({
      id: randomUUID(),
      data: {
        name: parsed.data.name,
        price: rupeesToPaise(parsed.data.price),
        unit: parsed.data.unit,
        category: parsed.data.category,
        stock: parsed.data.stock,
        inStock: parsed.data.stock > 0,
        imageUrl: parsed.data.imageUrl ?? null,
        ...(parsed.data.brand ? { brand: parsed.data.brand } : {}),
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        ...(parsed.data.mrp ? { mrp: rupeesToPaise(parsed.data.mrp) } : {}),
        ...(parsed.data.aliases?.length ? { aliases: parsed.data.aliases } : {}),
        ...(parsed.data.stock > 0 ? { lastRestockedAt: now } : {}),
        updatedAt: now,
      },
    });
  });

  if (rows.length === 0) {
    return { ok: false, error: "No valid products found in file", data: { products: [], failed } };
  }

  // One transaction: every valid row lands together with the itemCount bump.
  await db().begin(async (tx) => {
    const values = rows.map(({ id, data }) => ({
      id,
      shopId,
      name: data.name,
      price: data.price,
      unit: data.unit,
      category: data.category,
      stock: data.stock,
      inStock: data.inStock,
      imageUrl: data.imageUrl,
      brand: data.brand ?? null,
      description: data.description ?? null,
      mrp: data.mrp ?? null,
      aliases: data.aliases ?? null,
      lastRestockedAt: data.lastRestockedAt ?? null,
      updatedAt: data.updatedAt,
    }));
    await tx`insert into products ${tx(values)}`;
    await tx`update shops set item_count = item_count + ${rows.length}, updated_at = ${now} where id = ${shopId}`;
  });

  const products: ProductDoc[] = rows.map((row) => ({
    id: row.id,
    shopId,
    ...row.data,
  }));

  invalidateCatalog(shopId);
  return { ok: true, data: { products, failed } };
}

export async function updateProduct(
  shopId: string,
  productId: string,
  input: Partial<ProductInput>
): Promise<ActionResult> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);

  const parsed = productSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  // zod keeps `key: undefined` entries for optional fields the caller passed
  // as undefined (e.g. clearing an optional field in the form) — those mean
  // "not changed", so drop them rather than write NULL.
  const update: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) update[key] = value;
  }
  if (parsed.data.stock !== undefined) {
    update.inStock = parsed.data.stock > 0;
    // Stock going up = a restock; the Reports page shows when that last happened.
    const [current] = await db()`select stock from products where id = ${productId} and shop_id = ${shopId}`;
    if (typeof current?.stock !== "number" || parsed.data.stock > current.stock) {
      update.lastRestockedAt = update.updatedAt;
    }
  }

  await db()`update products set ${db()(update)} where id = ${productId} and shop_id = ${shopId}`;
  invalidateCatalog(shopId);
  return { ok: true };
}

export async function setProductStock(
  shopId: string,
  productId: string,
  stock: number
): Promise<ActionResult> {
  return updateProduct(shopId, productId, { stock });
}

export async function deleteProduct(shopId: string, productId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);

  // Order line items are frozen snapshots at order time (see types/index.ts
  // OrderItem), so deleting the catalog row never touches past orders.
  await db().begin(async (tx) => {
    const deleted = await tx`delete from products where id = ${productId} and shop_id = ${shopId} returning id`;
    if (deleted.length > 0) {
      await tx`update shops set item_count = greatest(item_count - 1, 0), updated_at = ${Date.now()} where id = ${shopId}`;
    }
  });

  invalidateCatalog(shopId);
  return { ok: true };
}

/** Attach already-uploaded image URLs to products (used after a bulk import with photos). */
export async function bulkSetProductImages(
  shopId: string,
  items: { productId: string; imageUrl: string }[]
): Promise<ActionResult> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);

  const now = Date.now();
  await db().begin(async (tx) => {
    for (const { productId, imageUrl } of items) {
      const url = productImageSchema.safeParse(imageUrl);
      if (!url.success) continue;
      await tx`update products set image_url = ${url.data}, updated_at = ${now} where id = ${productId} and shop_id = ${shopId}`;
    }
  });
  invalidateCatalog(shopId);
  return { ok: true };
}

/**
 * Step one of a product photo upload (the browser does step two, see
 * src/lib/supabase/upload.ts): checks the caller owns the shop, then hands
 * back a one-time signed URL for exactly one file path in the shop's photo
 * folder. The bucket itself enforces the 5 MB / image-only limits.
 */
export async function createProductImageUpload(
  shopId: string,
  productId: string,
  fileName: string,
  contentType: string,
): Promise<ActionResult<{ path: string; token: string; publicUrl: string }>> {
  // Not the productWrite rate limit: a photo import asks for one of these per
  // product (up to 200), right after the import itself.
  const userId = await requireAuthedUserId();
  await assertShopOwnership(userId, shopId);
  if (!contentType.startsWith("image/")) return { ok: false, error: "Only images can be uploaded" };
  const safeName = fileName.replace(/[^\w.-]+/g, "_").slice(-80) || "photo";
  const path = `shops/${shopId}/products/${productId}/${Date.now()}-${safeName}`;
  const target = await productImageUploadTarget(path);
  return { ok: true, data: target };
}

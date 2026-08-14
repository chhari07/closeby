"use server";

import { auth } from "@clerk/nextjs/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  productSchema,
  productImportItemSchema,
  type ProductInput,
} from "@/lib/validation/product";
import { rupeesToPaise } from "@/lib/money";
import type { ActionResult } from "./types";
import type { ProductDoc } from "@/types";

async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  return userId;
}

async function assertOwnsShop(userId: string, shopId: string) {
  const doc = await adminDb().collection("shops").doc(shopId).get();
  if (!doc.exists || doc.data()?.ownerId !== userId) {
    throw new Error("You do not own this shop");
  }
}

export async function getShopProducts(shopId: string): Promise<ProductDoc[]> {
  const snap = await adminDb()
    .collection("shops")
    .doc(shopId)
    .collection("products")
    .orderBy("updatedAt", "desc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, shopId, ...(d.data() as Omit<ProductDoc, "id" | "shopId">) }));
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
  await assertOwnsShop(userId, shopId);

  const col = adminDb().collection("shops").doc(shopId).collection("products");
  const batch = adminDb().batch();

  if (!inStock) {
    for (const id of productIds) {
      batch.update(col.doc(id), { stock: 0, inStock: false, updatedAt: Date.now() });
    }
  } else {
    const refs = productIds.map((id) => col.doc(id));
    const docs = await adminDb().getAll(...refs);
    for (const doc of docs) {
      const stock = (doc.data()?.stock as number | undefined) ?? 0;
      if (stock <= 0) {
        batch.update(doc.ref, { stock: 1, inStock: true, updatedAt: Date.now() });
      }
    }
  }

  await batch.commit();
  return { ok: true };
}

export async function addProduct(
  shopId: string,
  input: ProductInput
): Promise<ActionResult<{ productId: string }>> {
  const userId = await requireUserId();
  await assertOwnsShop(userId, shopId);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const shopRef = adminDb().collection("shops").doc(shopId);
  const ref = shopRef.collection("products").doc();
  const { name, price, unit, category, stock, imageUrl } = parsed.data;

  await adminDb().runTransaction(async (tx) => {
    tx.set(ref, {
      name,
      price,
      unit,
      category,
      stock,
      inStock: stock > 0,
      imageUrl: imageUrl ?? null,
      updatedAt: Date.now(),
    });
    tx.update(shopRef, { itemCount: FieldValue.increment(1), updatedAt: Date.now() });
  });

  return { ok: true, data: { productId: ref.id } };
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
  await assertOwnsShop(userId, shopId);

  if (!Array.isArray(items)) {
    return { ok: false, error: "The file must contain a JSON array of products" };
  }
  if (items.length === 0) {
    return { ok: false, error: "The file has no products in it" };
  }
  if (items.length > 200) {
    return { ok: false, error: "Import is limited to 200 products at a time" };
  }

  const shopRef = adminDb().collection("shops").doc(shopId);
  const col = shopRef.collection("products");
  const now = Date.now();

  // Validate each row independently so one bad row doesn't sink the whole
  // file — valid rows still get imported, invalid ones are reported back.
  type Row = { ref: FirebaseFirestore.DocumentReference; data: Omit<ProductDoc, "id" | "shopId"> };
  const failed: { index: number; error: string }[] = [];
  const rows: Row[] = [];

  items.forEach((item, index) => {
    const parsed = productImportItemSchema.safeParse(item);
    if (!parsed.success) {
      failed.push({ index, error: parsed.error.issues[0]?.message ?? "Invalid product" });
      return;
    }
    rows.push({
      ref: col.doc(),
      data: {
        name: parsed.data.name,
        price: rupeesToPaise(parsed.data.price),
        unit: parsed.data.unit,
        category: parsed.data.category,
        stock: parsed.data.stock,
        inStock: parsed.data.stock > 0,
        imageUrl: null,
        updatedAt: now,
      },
    });
  });

  if (rows.length === 0) {
    return { ok: false, error: "No valid products found in file", data: { products: [], failed } };
  }

  // Firestore batches cap at 500 ops; chunk defensively (product writes +
  // one itemCount update per chunk).
  const CHUNK_SIZE = 400;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const batch = adminDb().batch();
    for (const row of chunk) batch.set(row.ref, row.data);
    batch.update(shopRef, { itemCount: FieldValue.increment(chunk.length), updatedAt: now });
    await batch.commit();
  }

  const products: ProductDoc[] = rows.map((row) => ({
    id: row.ref.id,
    shopId,
    ...row.data,
  }));

  return { ok: true, data: { products, failed } };
}

export async function updateProduct(
  shopId: string,
  productId: string,
  input: Partial<ProductInput>
): Promise<ActionResult> {
  const userId = await requireUserId();
  await assertOwnsShop(userId, shopId);

  const parsed = productSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const update: Record<string, unknown> = { ...parsed.data, updatedAt: Date.now() };
  if (parsed.data.stock !== undefined) {
    update.inStock = parsed.data.stock > 0;
  }

  await adminDb()
    .collection("shops")
    .doc(shopId)
    .collection("products")
    .doc(productId)
    .update(update);
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
  await assertOwnsShop(userId, shopId);

  const shopRef = adminDb().collection("shops").doc(shopId);
  const productRef = shopRef.collection("products").doc(productId);

  // Order line items are frozen snapshots at order time (see types/index.ts
  // OrderItem), so deleting the catalog doc never touches past orders.
  await adminDb().runTransaction(async (tx) => {
    tx.delete(productRef);
    tx.update(shopRef, { itemCount: FieldValue.increment(-1), updatedAt: Date.now() });
  });

  return { ok: true };
}

import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import type { ProductDoc } from "@/types";

/**
 * One cached copy of each shop's product list, shared by every page and
 * helper that needs "all of a shop's products": the storefront, product
 * search, the AI's product lookups, inventory, reports, the import
 * duplicate check. Without it each of those read every product doc from
 * Firestore on every view/search (~350 reads per search with 3 shops),
 * which is what exhausted the free plan's 50k reads/day.
 *
 * Freshness: every write that changes a product — add/edit/delete/import,
 * stock changes, an order reserving or returning stock — calls
 * invalidateCatalog(shopId) right after it commits, so the next read is
 * fresh. The TTL is only a backstop for writes made outside the app (the
 * scripts/ folder, the Firebase console). Order placement and the AI cart's
 * draftCart still read the individual product docs live, so a slightly old
 * cached list can never sell stock that isn't there.
 */

const CATALOG_TTL_SECONDS = 600;

const catalogTag = (shopId: string) => `catalog:${shopId}`;

export function getShopCatalog(shopId: string): Promise<ProductDoc[]> {
  return unstable_cache(
    async () => {
      const snap = await adminDb()
        .collection("shops")
        .doc(shopId)
        .collection("products")
        .orderBy("updatedAt", "desc")
        .get();
      return snap.docs.map((d) => ({ id: d.id, shopId, ...(d.data() as Omit<ProductDoc, "id" | "shopId">) }));
    },
    ["shop-catalog", shopId],
    { tags: [catalogTag(shopId)], revalidate: CATALOG_TTL_SECONDS },
  )();
}

/** Call after any write that changes a product in this shop (server actions / route handlers only). */
export function invalidateCatalog(shopId: string): void {
  revalidateTag(catalogTag(shopId));
}

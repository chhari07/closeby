"use server";

import { db } from "@/lib/db/client";
import { requireUserId, assertShopOwnership } from "@/lib/auth/guards";
import { toOrder } from "@/lib/db/rows";
import { SHOP_VISIBLE_PAYMENT } from "@/lib/payments/orders";
import {
  catalogueSpeed,
  DAY_MS,
  OWNER_SUGGESTION_TYPES,
  responseStats,
  STATS_WINDOW_DAYS,
  suggestionStats,
  type CatalogueSpeed,
  type ResponseStats,
  type SuggestionRow,
} from "@/lib/owner-stats";

export interface OwnerStats {
  suggestions: ReturnType<typeof suggestionStats>;
  response: ResponseStats;
  catalogue: CatalogueSpeed;
}

/** Step 3.4 — the dashboard's "AI & speed" numbers for one shop. */
export async function getOwnerStats(shopId: string): Promise<OwnerStats> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);
  const now = Date.now();

  const [approvalRows, orderRows, productRows] = await Promise.all([
    db()`
      select type, status, edited, created_at from approvals
      where shop_id = ${shopId} and type = any(${[...OWNER_SUGGESTION_TYPES]})
        and created_at >= ${now - STATS_WINDOW_DAYS * DAY_MS}
    `,
    db()`
      select * from orders
      where shop_id = ${shopId} and payment_status = any(${[...SHOP_VISIBLE_PAYMENT]})
        and created_at >= ${now - 14 * DAY_MS}
    `,
    db()`select created_at from products where shop_id = ${shopId}`,
  ]);

  return {
    suggestions: suggestionStats(approvalRows as unknown as SuggestionRow[], now),
    response: responseStats(orderRows.map(toOrder), now),
    catalogue: catalogueSpeed(
      productRows.map((r) => r.createdAt as number | null),
      productRows.length,
    ),
  };
}

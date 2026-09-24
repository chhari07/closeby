import "server-only";
import { db } from "@/lib/db/client";
import { toApproval, toOrder } from "@/lib/db/rows";
import { getShopCatalog } from "@/lib/catalog";
import { SHOP_VISIBLE_PAYMENT } from "@/lib/payments/orders";
import { clampIdea, ideaCandidates, productFacts, type IdeaCandidate, type IdeaKind } from "@/lib/shop-insights";
import { formatPaise } from "@/lib/money";
import type { ApprovalDoc } from "@/types/ai";

/**
 * Step 3.3 — owner restock & price ideas. The server works out which
 * products deserve an idea and the allowed range for any number
 * (src/lib/shop-insights.ts); the AI (shopIdeas helper) picks and explains;
 * saveShopIdeas re-checks everything and stores each idea as a pending
 * approval. Nothing changes a product until the owner presses Apply.
 */

/** Same order window as the Reports page, so the numbers agree. */
const MAX_ORDERS = 1000;
/** Unanswered ideas drop off after a week; a new run replaces them anyway. */
const IDEA_TTL_MS = 7 * 86_400_000;

export async function loadIdeaCandidates(shopId: string): Promise<IdeaCandidate[]> {
  const [orderRows, products] = await Promise.all([
    db()`
      select * from orders
      where shop_id = ${shopId} and payment_status = any(${[...SHOP_VISIBLE_PAYMENT]})
      order by created_at desc limit ${MAX_ORDERS}
    `,
    getShopCatalog(shopId),
  ]);
  const orders = orderRows.map(toOrder);
  const now = Date.now();
  const historyDays = orders.length ? (now - orders[orders.length - 1]!.createdAt) / 86_400_000 : 0;
  return ideaCandidates(productFacts(products, orders, now), historyDays);
}

const rupees = (paise: number) => formatPaise(paise).replace(/\.00$/, "");

/** One compact line per candidate — goes inside <data> (product names are owner-typed). */
export function describeCandidates(candidates: IdeaCandidate[]): string {
  return candidates
    .map(({ kind, facts: f, qtyRange, defaultQty, priceRange }) => {
      const parts = [
        `productId=${f.productId}`,
        `kind=${kind}`,
        `name="${f.name.replace(/"/g, "'")}" (${f.unit})`,
        `stock=${f.stock}`,
        `sold30d=${f.sold30d}`,
        `perDay=${f.perDay.toFixed(1)}`,
        `daysLeft=${f.daysLeft === null ? "n/a" : f.daysLeft.toFixed(1)}`,
        `price=${rupees(f.price)}`,
        `mrp=${f.mrp ? rupees(f.mrp) : "n/a"}`,
      ];
      if (qtyRange) parts.push(`suggestedQty=${defaultQty} (allowed ${qtyRange[0]}-${qtyRange[1]})`);
      if (priceRange) parts.push(`allowedPrice=${rupees(priceRange[0])}-${rupees(priceRange[1])} (rupees)`);
      return parts.join(" | ");
    })
    .join("\n");
}

/** What an idea approval's `draft` holds. */
export interface ShopIdeaDraft {
  kind: IdeaKind;
  shopId: string;
  productId: string;
  productName: string;
  unit: string;
  reason: string;
  facts: { stock: number; sold30d: number; perDay: number; daysLeft: number | null; price: number; mrp: number | null };
  /** Restock: how many to order. */
  suggestedQty?: number;
  /** Price / slow: suggested new price (paise). */
  suggestedPrice?: number;
}

export interface ProposedIdea {
  productId: string;
  kind: IdeaKind;
  suggestedQty?: number;
  /** Rupees, as the AI thinks in them. */
  suggestedPrice?: number;
  reason: string;
}

/**
 * Stores the AI's ideas as pending approvals — only for real candidates of
 * the same kind, with every number clamped into the server's allowed range.
 * Replaces this shop's previous unanswered ideas.
 */
export async function saveShopIdeas(userId: string, shopId: string, proposed: ProposedIdea[]): Promise<string[]> {
  const candidates = await loadIdeaCandidates(shopId);
  const byKey = new Map(candidates.map((c) => [`${c.kind}:${c.facts.productId}`, c]));
  const seen = new Set<string>();
  const now = Date.now();
  const drafts: ShopIdeaDraft[] = [];

  for (const idea of proposed) {
    const key = `${idea.kind}:${idea.productId}`;
    const candidate = byKey.get(key);
    if (!candidate || seen.has(key)) continue; // invented or repeated — dropped
    seen.add(key);
    const { qty, price } = clampIdea(candidate, {
      qty: idea.suggestedQty,
      price: idea.suggestedPrice === undefined ? undefined : idea.suggestedPrice * 100,
    });
    // A price idea with no actual change isn't an idea.
    if (candidate.kind === "price" && price === undefined) continue;
    const f = candidate.facts;
    drafts.push({
      kind: candidate.kind,
      shopId,
      productId: f.productId,
      productName: f.name,
      unit: f.unit,
      reason: idea.reason.trim().slice(0, 240),
      facts: {
        stock: f.stock,
        sold30d: f.sold30d,
        perDay: Math.round(f.perDay * 10) / 10,
        daysLeft: f.daysLeft === null ? null : Math.round(f.daysLeft * 10) / 10,
        price: f.price,
        mrp: f.mrp,
      },
      ...(qty !== undefined ? { suggestedQty: qty } : {}),
      ...(price !== undefined ? { suggestedPrice: price } : {}),
    });
  }

  return db().begin(async (tx) => {
    await tx`
      update approvals set status = 'expired', decided_at = ${now}
      where shop_id = ${shopId} and type = 'shopIdea' and status = 'pending'
    `;
    const ids: string[] = [];
    for (const draft of drafts.slice(0, 12)) {
      const [row] = await tx`
        insert into approvals (user_id, shop_id, type, draft, status, created_at, expires_at)
        values (${userId}, ${shopId}, 'shopIdea', ${tx.json(draft as never)}, 'pending', ${now}, ${now + IDEA_TTL_MS})
        returning id
      `;
      ids.push(row!.id as string);
    }
    return ids;
  });
}

/** The shop's current unanswered ideas, most urgent kind first. */
export async function pendingShopIdeas(userId: string, shopId: string): Promise<(ApprovalDoc & { draft: ShopIdeaDraft })[]> {
  const rows = await db()`
    select * from approvals
    where user_id = ${userId} and shop_id = ${shopId} and type = 'shopIdea'
      and status = 'pending' and expires_at > ${Date.now()}
    order by created_at desc
  `;
  const rank: Record<IdeaKind, number> = { restock: 0, price: 1, slow: 2 };
  return rows
    .map((r) => toApproval(r) as ApprovalDoc & { draft: ShopIdeaDraft })
    .sort((a, b) => rank[a.draft.kind] - rank[b.draft.kind] || (a.draft.facts.daysLeft ?? 99) - (b.draft.facts.daysLeft ?? 99));
}

import type { OrderDoc, OrderStatus, ProductDoc } from "@/types";

/**
 * Per-product sales facts, shared by the Reports page's restock forecast
 * and the owner's AI ideas (Step 3.3) so the two always show the same
 * numbers. Pure — no database — so it's unit-tested directly.
 */

export const DAY_MS = 86_400_000;
/** Sales window the forecast is based on. */
export const VELOCITY_DAYS = 30;

/** Orders whose stock stays taken: everything except rejected/cancelled. */
const COUNTS_AS_SOLD = new Set<OrderStatus>(["PLACED", "ACCEPTED", "PREPARING", "READY", "COMPLETED"]);

export interface ProductFacts {
  productId: string;
  name: string;
  unit: string;
  price: number; // paise
  mrp: number | null; // paise
  stock: number;
  /** Units sold (not rejected/cancelled) in the last VELOCITY_DAYS days. */
  sold30d: number;
  /** Average units sold per day over the window. */
  perDay: number;
  /** Days until it runs out at that rate; null = no recent sales. */
  daysLeft: number | null;
  lastRestockedAt: number | null;
}

/**
 * Current stock ÷ average daily sales over the last 30 days (or since the
 * oldest order, if the shop is newer than that — but never less than a week,
 * so one early order doesn't look like a huge daily rate).
 * `orders` must be the shop's orders, newest first.
 */
export function productFacts(products: ProductDoc[], orders: OrderDoc[], now: number): ProductFacts[] {
  const velocityStart = now - VELOCITY_DAYS * DAY_MS;
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (!COUNTS_AS_SOLD.has(o.status) || o.createdAt < velocityStart) continue;
    for (const item of o.items) sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.qty);
  }
  const oldestOrderAt = orders.length ? orders[orders.length - 1]!.createdAt : now;
  const windowDays = Math.max(7, Math.min(VELOCITY_DAYS, (now - oldestOrderAt) / DAY_MS));

  return products.map((p) => {
    const sold30d = sold.get(p.id) ?? 0;
    const perDay = sold30d / windowDays;
    const stock = Math.max(0, p.stock ?? 0);
    return {
      productId: p.id,
      name: p.name,
      unit: p.unit,
      price: p.price,
      mrp: typeof p.mrp === "number" && p.mrp > 0 ? p.mrp : null,
      stock,
      sold30d,
      perDay,
      daysLeft: perDay > 0 ? stock / perDay : null,
      lastRestockedAt: p.lastRestockedAt ?? null,
    };
  });
}

// --- AI ideas (Step 3.3): which products are worth an idea, and the hard
// limits any AI-suggested number must stay inside. Code decides what's a
// candidate and the allowed range; the AI only picks and explains. ---

export type IdeaKind = "restock" | "price" | "slow";

export interface IdeaCandidate {
  kind: IdeaKind;
  facts: ProductFacts;
  /** Restock: sensible order quantity (about two weeks of sales, less what's left). */
  defaultQty?: number;
  qtyRange?: [number, number];
  /** Price ideas: allowed price range in paise (never above MRP). */
  priceRange?: [number, number];
}

/** Runs out within this many days = restock idea. */
export const RESTOCK_WITHIN_DAYS = 7;
/** Sold at least this many in 30 days (and priced under MRP) = can try a small price rise. */
export const FAST_SELLER_30D = 15;
/** No sales in 30 days and at least this much stock = slow item. */
export const SLOW_MIN_STOCK = 5;
export const MAX_PRICE_RISE = 0.1;
export const MAX_PRICE_CUT = 0.15;

const MAX_PER_KIND = { restock: 8, price: 5, slow: 5 } as const;

/** Rounds paise to whole rupees. */
const toRupee = (paise: number) => Math.round(paise / 100) * 100;

export function ideaCandidates(facts: ProductFacts[]): IdeaCandidate[] {
  const restock = facts
    .filter((f) => f.sold30d > 0 && (f.stock === 0 || (f.daysLeft ?? Infinity) <= RESTOCK_WITHIN_DAYS))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, MAX_PER_KIND.restock)
    .map((f): IdeaCandidate => {
      const twoWeeks = Math.round(f.perDay * 14);
      return {
        kind: "restock",
        facts: f,
        defaultQty: Math.max(1, twoWeeks - f.stock),
        qtyRange: [1, Math.max(10, Math.ceil(f.perDay * 30) + 10)],
      };
    });

  // An item about to run out gets the restock idea only — one card per product.
  const restocking = new Set(restock.map((c) => c.facts.productId));
  const priceUp = facts
    .filter((f) => !restocking.has(f.productId) && f.sold30d >= FAST_SELLER_30D && f.mrp !== null && f.mrp > f.price)
    .sort((a, b) => b.sold30d - a.sold30d)
    .slice(0, MAX_PER_KIND.price)
    .map((f): IdeaCandidate => ({
      kind: "price",
      facts: f,
      priceRange: [f.price, Math.min(f.mrp!, toRupee(f.price * (1 + MAX_PRICE_RISE)))],
    }))
    .filter((c) => c.priceRange![1] > c.priceRange![0]);

  const slow = facts
    .filter((f) => f.sold30d === 0 && f.stock >= SLOW_MIN_STOCK)
    .sort((a, b) => b.stock * b.price - a.stock * a.price)
    .slice(0, MAX_PER_KIND.slow)
    .map((f): IdeaCandidate => ({
      kind: "slow",
      facts: f,
      priceRange: [Math.max(100, toRupee(f.price * (1 - MAX_PRICE_CUT))), f.price],
    }));

  return [...restock, ...priceUp, ...slow];
}

/** Keeps an AI-suggested quantity/price inside the candidate's allowed range. */
export function clampIdea(
  candidate: IdeaCandidate,
  suggested: { qty?: number; price?: number },
): { qty?: number; price?: number } {
  const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
  const out: { qty?: number; price?: number } = {};
  if (candidate.kind === "restock") {
    const qty = Number.isFinite(suggested.qty) ? Math.round(suggested.qty!) : candidate.defaultQty!;
    out.qty = clamp(qty, candidate.qtyRange!);
  }
  if (candidate.priceRange && Number.isFinite(suggested.price)) {
    const price = toRupee(clamp(suggested.price!, candidate.priceRange));
    if (price !== candidate.facts.price) out.price = clamp(price, candidate.priceRange);
  }
  return out;
}

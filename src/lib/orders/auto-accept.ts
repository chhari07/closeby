import { z } from "zod";
import type { AutoAcceptRules, OrderDoc, ShopDoc, ShopHours } from "@/types";

/**
 * Step 5.1 — owner-approved auto-accept. The owner sets the rules (largest
 * order, which payment types); the shop must also be live, switched open and
 * inside its hours, the stock must already be reserved, and the order must
 * have no Step 5.2 warnings. Anything that fails a rule simply waits for the
 * owner as usual. Pure, so it's unit-tested; src/lib/orders/reached-shop.ts
 * applies it.
 */

export const PAYMENT_METHOD_LABEL = {
  cod: "Cash on delivery",
  pay_at_shop: "Pay at shop",
  online: "Paid online",
} as const;

export const DEFAULT_AUTO_ACCEPT: AutoAcceptRules = {
  enabled: false,
  maxOrderValue: 1000_00,
  paymentMethods: ["online", "cod", "pay_at_shop"],
};

/** ₹50,000 — above this an order always needs the owner. */
export const MAX_AUTO_ACCEPT_VALUE = 50_000_00;

export const autoAcceptRulesSchema = z.object({
  enabled: z.boolean(),
  maxOrderValue: z
    .number()
    .int()
    .min(100, "Set a limit of at least ₹1")
    .max(MAX_AUTO_ACCEPT_VALUE, "The limit can be at most ₹50,000"),
  paymentMethods: z
    .array(z.enum(["cod", "pay_at_shop", "online"]))
    .min(1, "Pick at least one payment type")
    .transform((m) => [...new Set(m)]),
});

// Shops are in India: hours are IST wall-clock times.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Inside the shop's working hours right now (IST)? Handles hours past midnight (e.g. 18:00–02:00). */
export function isWithinHours(hours: ShopHours, now: number): boolean {
  const ist = new Date(now + IST_OFFSET_MS);
  const day = ist.getUTCDay();
  const t = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  if (open < close) return hours.days.includes(day) && t >= open && t < close;
  // Overnight: the evening part belongs to today, the early-morning part to yesterday.
  const yesterday = (day + 6) % 7;
  return (hours.days.includes(day) && t >= open) || (hours.days.includes(yesterday) && t < close);
}

export type AutoAcceptDecision = { accept: true } | { accept: false; reason: string };

export function evaluateAutoAccept(
  shop: Pick<ShopDoc, "status" | "isOpen" | "hours" | "autoAccept">,
  order: Pick<OrderDoc, "status" | "paymentMethod" | "paymentStatus" | "itemTotal" | "stockReserved" | "riskFlags">,
  now: number,
): AutoAcceptDecision {
  const rules = shop.autoAccept;
  if (!rules?.enabled) return { accept: false, reason: "Auto-accept is off" };
  if (order.status !== "PLACED") return { accept: false, reason: "Order was already answered" };
  if (order.paymentMethod === "online" && order.paymentStatus !== "paid") {
    return { accept: false, reason: "Online order isn't paid yet" };
  }
  if (!rules.paymentMethods.includes(order.paymentMethod)) {
    return { accept: false, reason: `${PAYMENT_METHOD_LABEL[order.paymentMethod]} orders wait for you` };
  }
  if (order.itemTotal > rules.maxOrderValue) return { accept: false, reason: "Order is above your auto-accept limit" };
  if (shop.status !== "live" || !shop.isOpen) return { accept: false, reason: "Shop is closed" };
  if (shop.hours && !isWithinHours(shop.hours, now)) return { accept: false, reason: "Outside your working hours" };
  if (!order.stockReserved) return { accept: false, reason: "Stock wasn't reserved" };
  if ((order.riskFlags ?? []).length > 0) return { accept: false, reason: "Order has warnings to check" };
  return { accept: true };
}

// --- When may the owner turn it on? ------------------------------------------

/** Roadmap: "only after Step 3 accept rate is high". Either proof is enough. */
export const READY_ADVICE_MIN_DECIDED = 5;
export const READY_ADVICE_MIN_RATE = 0.8;
export const READY_OWN_MIN_ANSWERED = 10;
export const READY_OWN_MIN_RATE = 0.9;

export interface AutoAcceptReadiness {
  ready: boolean;
  /** What unlocked it, or what's still missing — shown to the owner. */
  detail: string;
}

/**
 * @param advice  the owner's decisions on AI order advice (last 30 days)
 * @param own     the shop's own answers to its last orders (accepted vs rejected)
 */
export function autoAcceptReadiness(
  advice: { decided: number; accepted: number },
  own: { answered: number; accepted: number },
): AutoAcceptReadiness {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  if (advice.decided >= READY_ADVICE_MIN_DECIDED && advice.accepted / advice.decided >= READY_ADVICE_MIN_RATE) {
    return {
      ready: true,
      detail: `You agreed with ${pct(advice.accepted / advice.decided)} of the AI's order advice (${advice.accepted} of ${advice.decided}).`,
    };
  }
  if (own.answered >= READY_OWN_MIN_ANSWERED && own.accepted / own.answered >= READY_OWN_MIN_RATE) {
    return {
      ready: true,
      detail: `You accepted ${pct(own.accepted / own.answered)} of your last ${own.answered} orders.`,
    };
  }
  return {
    ready: false,
    detail:
      `Unlocks when you accept at least ${pct(READY_OWN_MIN_RATE)} of ${READY_OWN_MIN_ANSWERED}+ orders ` +
      `(now ${own.accepted} of ${own.answered}), or agree with ${pct(READY_ADVICE_MIN_RATE)} of ` +
      `${READY_ADVICE_MIN_DECIDED}+ AI order suggestions (now ${advice.accepted} of ${advice.decided}).`,
  };
}

type TimelineOrder = Pick<OrderDoc, "timeline">;

/** How the owner answered these orders by hand (auto-accepted ones don't count). */
export function ownAnswerStats(orders: TimelineOrder[]): { answered: number; accepted: number } {
  let answered = 0;
  let accepted = 0;
  for (const o of orders) {
    const answer = o.timeline.find((t) => t.by === "shop" && (t.status === "ACCEPTED" || t.status === "REJECTED"));
    if (!answer || answer.auto) continue;
    answered++;
    if (answer.status === "ACCEPTED") accepted++;
  }
  return { answered, accepted };
}

export const wasAutoAccepted = (o: TimelineOrder) => o.timeline.some((t) => t.status === "ACCEPTED" && t.auto);

/** How auto-accept has gone: how many it took, and how many the shop later had to cancel. */
export function autoAcceptResults(orders: (TimelineOrder & Pick<OrderDoc, "status">)[]): { accepted: number; cancelledLater: number } {
  const auto = orders.filter(wasAutoAccepted);
  return {
    accepted: auto.length,
    cancelledLater: auto.filter((o) => o.status === "CANCELLED" && o.timeline.some((t) => t.status === "CANCELLED" && t.by === "shop")).length,
  };
}

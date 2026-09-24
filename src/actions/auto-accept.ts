"use server";

import { db } from "@/lib/db/client";
import { findOrder, toOrder } from "@/lib/db/rows";
import { requireShopOwner, requireUserId, assertShopOwnership } from "@/lib/auth/guards";
import { SHOP_VISIBLE_PAYMENT } from "@/lib/payments/orders";
import { DAY_MS } from "@/lib/owner-stats";
import {
  autoAcceptReadiness,
  autoAcceptResults,
  autoAcceptRulesSchema,
  DEFAULT_AUTO_ACCEPT,
  ownAnswerStats,
  type AutoAcceptReadiness,
} from "@/lib/orders/auto-accept";
import type { ActionResult } from "./types";
import type { AutoAcceptRules } from "@/types";

export interface AutoAcceptSettings {
  rules: AutoAcceptRules;
  readiness: AutoAcceptReadiness;
  /** Last 30 days. */
  results: { accepted: number; cancelledLater: number };
}

/** Owner's answers to the last this-many orders count toward "ready". */
const OWN_HISTORY_ORDERS = 20;

async function loadReadiness(shopId: string, now: number) {
  const [advice, recent, last30] = await Promise.all([
    db()`
      select status from approvals
      where shop_id = ${shopId} and type = 'draftOrderAdvice' and status in ('approved', 'rejected')
        and created_at >= ${now - 30 * DAY_MS}
    `,
    db()`
      select timeline from orders
      where shop_id = ${shopId} and payment_status = any(${[...SHOP_VISIBLE_PAYMENT]}) and status <> 'PLACED'
      order by created_at desc limit ${OWN_HISTORY_ORDERS}
    `,
    db()`
      select status, timeline from orders
      where shop_id = ${shopId} and created_at >= ${now - 30 * DAY_MS}
        and timeline @> ${db().json([{ status: "ACCEPTED", auto: true }])}
    `,
  ]);
  const readiness = autoAcceptReadiness(
    { decided: advice.length, accepted: advice.filter((r) => r.status === "approved").length },
    ownAnswerStats(recent.map(toOrder)),
  );
  return { readiness, results: autoAcceptResults(last30.map(toOrder)) };
}

/** Step 5.1 — the settings card: current rules, whether it may be turned on, how it has gone. */
export async function getAutoAcceptSettings(shopId: string): Promise<AutoAcceptSettings> {
  const userId = await requireUserId();
  const shop = await assertShopOwnership(userId, shopId);
  const { readiness, results } = await loadReadiness(shopId, Date.now());
  return { rules: shop.autoAccept ?? DEFAULT_AUTO_ACCEPT, readiness, results };
}

/**
 * Saves the owner's rules. Turning it ON needs a high accept rate first
 * (roadmap 5.1); turning it OFF or changing the limits is always allowed.
 */
export async function saveAutoAcceptRules(shopId: string, input: AutoAcceptRules): Promise<ActionResult<AutoAcceptRules>> {
  const { shop } = await requireShopOwner(shopId);
  const parsed = autoAcceptRulesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid rules" };
  const rules = parsed.data;

  if (rules.enabled && !shop.autoAccept?.enabled) {
    const { readiness } = await loadReadiness(shopId, Date.now());
    if (!readiness.ready) return { ok: false, error: readiness.detail };
  }
  await db()`update shops set auto_accept = ${db().json(rules)}, updated_at = ${Date.now()} where id = ${shopId}`;
  return { ok: true, data: rules };
}

/** Step 5.2 — the owner checked an order's warnings ("Looks fine"). Doesn't accept it. */
export async function markOrderRiskReviewed(orderId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const order = await findOrder(orderId);
  if (!order) return { ok: false, error: "Order not found" };
  await assertShopOwnership(userId, order.shopId);
  await db()`update orders set risk_reviewed_at = ${Date.now()} where id = ${orderId} and risk_reviewed_at is null`;
  return { ok: true };
}


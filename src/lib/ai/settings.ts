import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { AiHelperName, AiSettingsDoc } from "@/types/ai";

const DEFAULT_DAILY_LIMIT_USD = 2;

/** Fastest possible off switch — no DB read, flips instantly via env. */
export function globalKillSwitchOn(): boolean {
  return process.env.AI_DISABLED === "true";
}

/** Global doc id = helper name; per-shop override doc id = `${helper}__${shopId}`. */
function shopDocId(helper: AiHelperName, shopId: string): string {
  return `${helper}__${shopId}`;
}

/**
 * Checked at every AI route call (order-of-checks step 3). Missing docs
 * default to enabled — an owner/admin has to explicitly turn a helper off.
 */
export async function isHelperEnabled(helper: AiHelperName, shopId?: string): Promise<boolean> {
  if (globalKillSwitchOn()) return false;

  const globalDoc = await adminDb().collection("aiSettings").doc(helper).get();
  if (globalDoc.exists && globalDoc.data()?.enabled === false) return false;

  if (shopId) {
    const shopDoc = await adminDb().collection("aiSettings").doc(shopDocId(helper, shopId)).get();
    if (shopDoc.exists && shopDoc.data()?.enabled === false) return false;
  }
  return true;
}

export async function getDailyLimitUsd(helper: AiHelperName): Promise<number> {
  const doc = await adminDb().collection("aiSettings").doc(helper).get();
  const limit = doc.data()?.dailyLimitUsd;
  return typeof limit === "number" && limit > 0 ? limit : DEFAULT_DAILY_LIMIT_USD;
}

/** Owner-facing toggle (per-shop) or an operator's global toggle (no shopId). */
export async function setHelperEnabled(
  helper: AiHelperName,
  enabled: boolean,
  shopId?: string,
): Promise<void> {
  const id = shopId ? shopDocId(helper, shopId) : helper;
  const doc: AiSettingsDoc = { helper, shopId: shopId ?? null, enabled };
  await adminDb().collection("aiSettings").doc(id).set(doc, { merge: true });
}

/** For a settings UI: whether each helper is currently on for this shop. */
export async function getHelperStatusesForShop(
  shopId: string,
): Promise<Record<AiHelperName, boolean>> {
  const names: AiHelperName[] = ["hello", "buyerCartDraft", "orderAdvice", "stockDraft"];
  const statuses = await Promise.all(names.map((n) => isHelperEnabled(n, shopId)));
  return Object.fromEntries(names.map((n, i) => [n, statuses[i]])) as Record<AiHelperName, boolean>;
}

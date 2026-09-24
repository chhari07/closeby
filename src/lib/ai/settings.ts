import "server-only";
import { db } from "@/lib/db/client";
import type { AiHelperName, AiSettingsDoc } from "@/types/ai";

const DEFAULT_DAILY_LIMIT_USD = 2;

/** Fastest possible off switch — no DB read, flips instantly via env. */
export function globalKillSwitchOn(): boolean {
  return process.env.AI_DISABLED === "true";
}

/** Global row id = helper name; per-shop override row id = `${helper}__${shopId}`. */
function shopDocId(helper: AiHelperName, shopId: string): string {
  return `${helper}__${shopId}`;
}

/**
 * Checked at every AI route call (order-of-checks step 3). Missing rows
 * default to enabled — an owner/admin has to explicitly turn a helper off.
 */
export async function isHelperEnabled(helper: AiHelperName, shopId?: string): Promise<boolean> {
  if (globalKillSwitchOn()) return false;

  const ids = shopId ? [helper, shopDocId(helper, shopId)] : [helper];
  const rows = await db()`select enabled from ai_settings where id = any(${ids})`;
  return !rows.some((r) => r.enabled === false);
}

export async function getDailyLimitUsd(helper: AiHelperName): Promise<number> {
  const [row] = await db()`select daily_limit_usd from ai_settings where id = ${helper}`;
  const limit = row?.dailyLimitUsd;
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
  await db()`
    insert into ai_settings (id, helper, shop_id, enabled)
    values (${id}, ${doc.helper}, ${doc.shopId}, ${doc.enabled})
    on conflict (id) do update set enabled = excluded.enabled
  `;
}

/** For a settings UI: whether each helper is currently on for this shop. */
export async function getHelperStatusesForShop(
  shopId: string,
): Promise<Record<AiHelperName, boolean>> {
  const names: AiHelperName[] = ["hello", "buyerCartDraft", "orderAdvice", "stockDraft", "chatReply"];
  const statuses = await Promise.all(names.map((n) => isHelperEnabled(n, shopId)));
  return Object.fromEntries(names.map((n, i) => [n, statuses[i]])) as Record<AiHelperName, boolean>;
}

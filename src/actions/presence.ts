"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import type { ActionResult } from "./types";

/**
 * Called every minute by any open CloseBy tab (PresenceHeartbeat): while
 * this stays fresh, alerts arrive in the page and nothing is emailed
 * (src/lib/email/alerts.ts). Only touches an existing profile row.
 */
export async function heartbeat(): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;
  await db()`update users set last_seen_at = ${Date.now()} where id = ${userId}`;
}

export async function getEmailAlerts(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const [row] = await db()`select email_alerts from users where id = ${userId}`;
  return row?.emailAlerts !== false;
}

export async function setEmailAlerts(enabled: boolean): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };
  await db()`update users set email_alerts = ${enabled === true} where id = ${userId}`;
  return { ok: true };
}

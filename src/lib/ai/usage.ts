import "server-only";
import { db } from "@/lib/db/client";

/** Server-clock UTC day — a soft daily cap, not a billing-accurate boundary. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaySpendUsd(userId: string): Promise<number> {
  const [row] = await db()`select cost_usd from ai_usage where user_id = ${userId} and date = ${todayKey()}`;
  const cost = row?.costUsd;
  return typeof cost === "number" ? cost : 0;
}

/** Called after every call, success or failure — a failed call still spent tokens. */
export async function recordUsage(userId: string, costUsd: number): Promise<void> {
  const date = todayKey();
  await db()`
    insert into ai_usage (user_id, date, cost_usd, requests)
    values (${userId}, ${date}, ${costUsd}, 1)
    on conflict (user_id, date) do update set
      cost_usd = ai_usage.cost_usd + excluded.cost_usd,
      requests = ai_usage.requests + 1
  `;
}

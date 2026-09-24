import "server-only";
import { db } from "@/lib/db/client";
import { queueAlert, renderAlert } from "@/lib/email/alerts";
import { sendEmail } from "@/lib/email/send";
import { detectCostJump, formatUsd, istDay, COST_BASELINE_DAYS, DAY_MS } from "./ops-metrics";

/** Checked at most this often per server process — every AI run would be wasteful. */
const CHECK_EVERY_MS = 10 * 60_000;
let lastCheckAt = 0;

/** AI spend per IST day, for the days from `sinceDay` on. */
export async function dailyAiCost(sinceDay: number): Promise<Map<number, number>> {
  const since = sinceDay * DAY_MS - 5.5 * 60 * 60 * 1000;
  const rows = await db()`
    select floor((created_at + 19800000) / 86400000)::int as day, sum(cost_usd)::float as usd
    from ai_runs where created_at >= ${since}
    group by 1
  `;
  return new Map(rows.map((r) => [r.day as number, r.usd as number]));
}

/**
 * Step 5.6 "alerts on cost jump": after an AI run, compares today's AI spend
 * with a normal day and emails the operators (ADMIN_EMAILS) once per day when
 * it jumps. The /admin page shows the same warning. Never throws.
 */
export function checkAiCostJumpSoon(): void {
  const now = Date.now();
  if (now - lastCheckAt < CHECK_EVERY_MS) return;
  lastCheckAt = now;
  void queueAlert(async (base) => {
    const to = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) return;
    const today = istDay(Date.now());
    const jump = detectCostJump(await dailyAiCost(today - COST_BASELINE_DAYS), today);
    if (!jump.jumped) return;
    const [claimed] = await db()`
      insert into email_alert_log (key, sent_at) values (${`ai-cost-jump:${today}`}, ${Date.now()})
      on conflict (key) do nothing returning key
    `;
    if (!claimed) return;
    const mail = renderAlert({
      name: "CloseBy team",
      heading: `AI spend jumped: ${formatUsd(jump.todayUsd)} so far today`,
      lines: [
        `A normal day over the last ${COST_BASELINE_DAYS} days is about ${formatUsd(jump.baselineUsd)}` +
          (jump.ratio ? ` — today is ${jump.ratio.toFixed(1)}× that.` : "."),
        "Check which helper is spending on the operator dashboard. To stop all AI at once, set AI_DISABLED=true.",
      ],
      button: { label: "Open dashboard", url: `${base}/admin` },
    });
    for (const address of to) await sendEmail({ to: address, subject: `⚠ CloseBy AI spend jumped to ${formatUsd(jump.todayUsd)} today`, ...mail });
  }).catch((err) => console.error("[ops alert] cost check failed", err));
}

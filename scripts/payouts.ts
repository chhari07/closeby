/**
 * What CloseBy owes each shop from online (Razorpay) payments: completed
 * orders paid online, grouped by shop, for a date range. Money lands in the
 * CloseBy Razorpay account; settle with each shop from this list.
 *
 *   npm run payouts                          # this month so far
 *   npm run payouts -- 2026-09-01 2026-09-30 # a date range (IST, inclusive)
 *
 * Razorpay's own fee (~2%) is not deducted here — it shows in the Razorpay
 * dashboard's settlement report.
 */
import { connect } from "./lib/db";

const IST = 5.5 * 60 * 60 * 1000;
const istMidnight = (d: string) => Date.parse(`${d}T00:00:00Z`) - IST;

async function main() {
  const [fromArg, toArg] = process.argv.slice(2);
  const now = new Date(Date.now() + IST);
  const from = fromArg ?? `${now.toISOString().slice(0, 8)}01`;
  const to = toArg ?? now.toISOString().slice(0, 10);
  const start = istMidnight(from);
  const end = istMidnight(to) + 86_400_000;

  const sql = connect();
  const rows = await sql`
    select s.id, s.name, s.phone, count(*)::int as orders, sum(o.item_total)::bigint as paise
    from orders o join shops s on s.id = o.shop_id
    where o.payment_method = 'online' and o.payment_status = 'paid' and o.status = 'COMPLETED'
      and o.paid_at >= ${start} and o.paid_at < ${end}
    group by s.id, s.name, s.phone
    order by paise desc
  `;
  console.log(`Online payments for completed orders, ${from} to ${to} (IST):\n`);
  let total = 0;
  for (const r of rows) {
    total += r.paise as number;
    console.log(`${String(r.name).padEnd(32)} ${String(r.phone).padEnd(12)} ${String(r.orders).padStart(4)} orders   ₹${((r.paise as number) / 100).toFixed(2)}`);
  }
  console.log(rows.length ? `\nTotal owed to shops: ₹${(total / 100).toFixed(2)}` : "No completed online-paid orders in this range.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

# Auto-accept, order warnings and operator dashboard (Steps 5.1, 5.2, 5.6) — manual test checklist

Run `npm run db:migrate` first (adds `0010_auto_accept_risk.sql`).

## 5.1 Auto-accept (Shop settings > Auto-accept orders)

| # | ✓ | Do this | Expect |
|---|---|---|---|
| 1 | [ ] | New shop with few answered orders: open **Settings**. | Switch is locked; the grey line says what unlocks it (accept 90% of 10+ orders, or agree with 80% of 5+ AI order suggestions) with your current numbers. |
| 2 | [ ] | Accept 10 orders by hand (or `npm run seed:sales`), reload Settings. | "✓ You accepted …% of your last … orders"; the switch works. |
| 3 | [ ] | Turn it on with limit ₹500 and only **Cash on delivery**. As a buyer, place a ₹200 cash order. | The order appears as **Accepted** at once with "⚡ Auto-accepted by your rules"; buyer sees Accepted. |
| 4 | [ ] | Place a ₹700 cash order. | Stays **New** — waits for you. |
| 5 | [ ] | Place a ₹200 **online** order and pay. | Waits (online isn't ticked). Tick **Paid online**, save, repeat: accepted once paid, never before. |
| 6 | [ ] | Switch the shop **closed**, or set hours that exclude now, and order. | Waits for you. |
| 7 | [ ] | Order that has a warning (see 5.2). | Waits for you, even under the limit. |
| 8 | [ ] | Cancel an auto-accepted order as the shop. Reload Settings. | "Last 30 days: N auto-accepted, 1 later cancelled by you". |
| 9 | [ ] | Turn it off. | New orders wait again. Turning off is always allowed. |

## 5.2 Order warnings (owner's order card)

| # | ✓ | Do this | Expect |
|---|---|---|---|
| 1 | [ ] | Normal order. | No warning box. |
| 2 | [ ] | Same buyer places 4 orders within an hour. | 4th shows **Check before accepting · Placed 3 other orders in the last hour**. |
| 3 | [ ] | Cash order of ₹2,500+ from a buyer who never completed an order at this shop. | "₹… to pay in cash, from a buyer with no completed orders at your shop". |
| 4 | [ ] | Order 10+ of an item that takes (almost) all its stock. | "Takes N of your M … — all your stock". |
| 5 | [ ] | Delivery address 15+ km from the shop. | "Delivery address is N km from your shop" (red box if 50+ km). |
| 6 | [ ] | Press **Looks fine**. | Box shrinks to "N warnings checked by you"; the order is NOT accepted — you still accept/reject. |
| 7 | [ ] | As the buyer, open the order. | No warnings shown anywhere. |
| 8 | [ ] | Owner is away (site closed) when a flagged order arrives. | The new-order email lists the warnings. |

## 5.6 Operator dashboard (`/admin`)

| # | ✓ | Do this | Expect |
|---|---|---|---|
| 1 | [ ] | Open `/admin` without your id in `ADMIN_USER_IDS`. | 404. |
| 2 | [ ] | Add your Clerk id, restart dev server, open `/admin`. | Tiles: AI cost per order, AI error rate, order reject rate, orders with warnings; 14-day AI spend chart (hover a bar); helpers table; slowest AI answers; slowest shops; warning counts. |
| 3 | [ ] | Switch **7 days / 30 days**. | Numbers change with the window. |
| 4 | [ ] | With `ADMIN_EMAILS` set, spend more on AI today than 2× a normal day (and ≥ $0.50). | Red banner on `/admin`; one email per day to ADMIN_EMAILS (printed in the terminal without Gmail set up). |

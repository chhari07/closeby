# Owner stats card (Step 3.4) — manual test checklist

The **AI & speed** card on the shop **Dashboard** shows three numbers:

1. **AI suggestions accepted (30 days)** — of the AI suggestions you answered
   (stock import lists, order accept/reject advice, restock & price ideas),
   how many you accepted; how many you accepted without changing anything;
   and how many you never answered. Split per helper underneath.
2. **Avg. time to accept/reject an order (7 days)** — from when the order
   reached you (placed, or paid for online orders) to your Accept/Reject,
   compared with the week before.
3. **Time to add your first 30 products** — from your 1st product to your
   30th. Roadmap goal: under 3 minutes (AI stock import makes this possible).

| # | ✓ | Do this | Expect |
|---|---|---|---|
| 1 | [ ] | Open **Dashboard**. | The **AI & speed** card is above **AI ideas**, with three boxes. |
| 2 | [ ] | Note the accept rate, then on **AI ideas** press **Apply** on one idea and **Dismiss** another. Reload. | "accepted" goes up by 1 and "decided" by 2; the **Restock & price ideas** line changes the same way. |
| 3 | [ ] | Apply a price idea after **changing** the price. Reload. | "accepted without changes" does **not** go up for that one. |
| 4 | [ ] | Use **AI stock import** (Inventory), confirm the list. Reload Dashboard. | A **Stock import** line appears / goes up. |
| 5 | [ ] | As a buyer, place an order; as the owner wait ~1 minute, then **Accept** it. Reload. | Avg. time now includes it (about 1 min pulls the average toward 1 min); "over N orders" goes up by 1. |
| 6 | [ ] | Place an order and let the **buyer cancel** it before you answer. | It does **not** count in the average (you never answered it). |
| 7 | [ ] | Online order: pay, wait, accept. | Timed from the **payment**, not from when checkout started. |
| 8 | [ ] | Shop whose products were added before this feature. | "Not measured — your first products were added before this was tracked." |
| 9 | [ ] | New shop (new owner account): add products one by one. | Shows "N of 30 added so far"; after the 30th, the time from the 1st to the 30th, with "✓ Under the 3-minute goal" if it took under 3 minutes. |
| 10 | [ ] | With test sales (`npm run seed:sales`). | Avg. response time shows about **2 min** (the test orders are accepted 2 minutes after placing). |

A buyer never sees this card, and one owner never sees another shop's numbers
(the server checks shop ownership).

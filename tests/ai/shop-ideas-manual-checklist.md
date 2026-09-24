# Owner AI ideas (Step 3.3) — manual test checklist

**What the feature does:** on the shop **Dashboard**, the **AI ideas** card
looks at the last 30 days of sales and the current stock, and suggests:

- 📦 **Restock** — a product that will run out within a week, with how many to order.
- 💰 **Price** — a new price for a product (fast sellers can go up a little,
  never above MRP; slow sellers can go down a little).
- 😴 **Slow item** — stock that hasn't sold in 30 days.

The numbers (stock, sales per day, days left, MRP) come from your real data;
the AI only chooses and explains. **Nothing changes until you press a
button**: a price only changes when you press **Apply**, and a restock idea
never changes stock (it's your shopping list for the supplier).

---

## Setup (once, ~2 minutes)

1. Run the app: `npm run dev`, and sign in as the **shop owner**.
2. A brand-new shop has no sales history, so create 30 days of test sales:
   ```
   npm run seed:sales
   ```
   It prints what it did, for example:
   - `LED Bulb 9 W` — ~3 sold per day, stock set to **4** → should get a **restock** idea
   - `AA Batteries` — ~2 sold per day, stock set to **3** → should get a **restock** idea
   - `USB-C Cable` — ~1.5 sold per day, plenty of stock, price below MRP → **may** get a **price** idea (the AI can decide a rise isn't worth it)
   - everything else: no sales → the ones with lots of stock may get a **slow item** idea

   The test orders belong to a buyer called **"Test buyer (sales history)"**
   and are all *Completed*, so they show in Orders → Completed and in Reports.
3. When you're done testing, undo it all (deletes those test orders, puts the
   old stock back): `npm run seed:sales -- --undo`

---

## Tests

| # | ✓ | Do this | Expect |
|---|---|---|---|
| 1 | [ ] | Open **Dashboard**. | An **AI ideas** card with a **Get ideas** button and "No ideas yet". |
| 2 | [ ] | Press **Get ideas**. | A spinner, then within ~15 s a list of ideas grouped as Restock / Price / Slow items, each with a one-line reason. |
| 3 | [ ] | Read the **LED Bulb 9 W** idea. | Restock. The facts line says **4 in stock**, about **3 sold/day**, runs out in about **1 day**. "Order about" roughly 2 weeks of sales (≈ 35–45). Only **one** card for this product. |
| 4 | [ ] | Compare with **Reports → Restock**. | The stock and "sold in 30 days" numbers match the idea's facts line exactly. |
| 5 | [ ] | On any idea with a **₹ price box** (Price or Slow item), press **Apply** without changing it. | Toast "Price updated". The idea disappears. **Inventory** and your shop page show the new price. |
| 6 | [ ] | On another idea with a price box, type a price **above the MRP**, press Apply. | Blocked: "Price can't be above the MRP (₹…)". Nothing changes. |
| 7 | [ ] | Type a different valid price, press Apply. | Your typed price is saved, not the AI's. |
| 8 | [ ] | On a **Restock** idea press **Done**. | The idea disappears. **Stock in Inventory is unchanged** (you update it when the goods arrive). |
| 9 | [ ] | On any idea press **Dismiss**, then reload the page. | It's gone and stays gone. |
| 10 | [ ] | Right after getting ideas, look at the button. | It says **Up to date** (greyed out), with "Made just now. New ideas when your sales or stock change, or after <time 6 h from now>." No AI call can be made — the server refuses too. |
| 10a | [ ] | Apply a price idea, then look at the button again. | Still **Up to date** — acting on an idea doesn't count as new data. |
| 10b | [ ] | Change something real: edit a product's stock in Inventory (or place an order as a buyer), then come back to Dashboard. | Within ~15 s the button turns back to **Refresh ideas** with "Your sales or stock changed since — refresh for new ideas." Press it: a fresh list replaces the old one, no duplicates. |
| 10c | [ ] | Weekly auto-refresh: run `npm run seed:sales -- --age-ideas 8`, then reload Dashboard. | Without pressing anything, the card shows "Updating your weekly ideas…" and then a fresh list. (`--age-ideas 7` or more triggers it; `--age-ideas 7` minus a little does not.) |
| 11 | [ ] | Settings → AI → switch off **AI restock & price ideas**, then Get ideas. | Error: "This AI helper is turned off right now." Switch it back on after. |
| 12 | [ ] | After `npm run seed:sales -- --undo`, press Get ideas. | "Nothing to suggest right now" — and no AI call is made (no cost) when there's no sales history to go on. |

## Safety checks

- [ ] The AI never invents a product: every idea is a product that exists in Inventory.
- [ ] No suggested price is ever above MRP, or more than 10% up / 15% down from the current price.
- [ ] No price or stock changed while you were only *looking* at ideas (check Inventory before pressing anything).
- [ ] A buyer account can't get ideas for your shop (the button isn't there, and the server refuses).

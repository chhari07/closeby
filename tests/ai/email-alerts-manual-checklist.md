# Email alerts when the site is closed (Step 5.4) — manual test checklist

**Rule:** while you have CloseBy open (any tab, even in the background) you
get the in-page sound + pop-up, and **no email**. When you've closed the site
(or have no CloseBy tab open for ~2½ minutes), the same event is **emailed**.

| Who | Emailed when away |
|---|---|
| Shop owner | New order (online orders: once paid) · buyer chat message |
| Buyer | Order accepted / ready / completed / rejected / cancelled by the shop · refund · shop chat message |

Chat: at most **one email per conversation every 10 minutes**. The same order
event is never emailed twice. Everyone can switch emails off in **Profile →
Email alerts**.

## Setup

1. Gmail: turn on **2-Step Verification** (myaccount.google.com → Security),
   then create an **App password** (Security → 2-Step Verification → App
   passwords → name it "CloseBy"). Copy the 16-letter password.
2. Add to `.env.local`, then restart `npm run dev`:
   ```
   GMAIL_USER=yourname@gmail.com
   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
   ```
   Without these, emails are printed in the `npm run dev` terminal instead —
   every test below still works, just read the terminal instead of the inbox.
3. Use two browsers (or one normal + one incognito): **A** = shop owner,
   **B** = buyer. Each account's email is the one it signed up with.

## Tests

| # | ✓ | Do this | Expect |
|---|---|---|---|
| 1 | [ ] | A open on Dashboard. B places an order. | A hears the ping + pop-up. **No email** to A. |
| 2 | [ ] | **Close every CloseBy tab in A.** B places another order. | Within a minute A gets **"🛒 New order #… — N items · ₹…"** listing the items, with an **Open orders** button. |
| 3 | [ ] | Press **Open orders** in that email. | Opens the dashboard orders page (sign in if asked). |
| 4 | [ ] | A (on the site) accepts B's order while **B has closed CloseBy**. | B gets **"Your order from … accepted"**. |
| 5 | [ ] | A marks it Preparing. | **No** email (not worth one). Ready → email; Completed → email. |
| 6 | [ ] | A rejects an online-paid order while B is away. | **One** email to B: rejected, with the reason and "being refunded in full" (no separate refund email). |
| 7 | [ ] | B cancels a paid order themselves, then closes the site. | B gets **"Refund of ₹… for your CloseBy order"** (B did the cancel, so no status email). |
| 8 | [ ] | A away. B sends 3 chat messages in a row. | A gets **one** email ("💬 Buyer: first message"), not three. After 10 minutes, the next message emails again. |
| 9 | [ ] | B away. A replies in chat. | B gets "💬 <shop>: …" with a **Reply** button that opens that conversation. |
| 10 | [ ] | A: **Profile → Email alerts** off. Close the site. B orders. | **No** email. Turn it back on. |
| 11 | [ ] | Place an order and watch the checkout. | Placing an order is **not slower** — emails go out after the response. |
| 12 | [ ] | A has CloseBy open in a **background** tab only. B orders. | No email (A still gets the browser notification from the open tab). |

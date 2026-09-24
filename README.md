# CloseBy

CloseBy connects buyers to the real, physical shops already near them —
kirana stores, pharmacies, stationers, bakeries, electronics shops and more
— instead of a warehouse styled to look local. Buyers browse and order from
shops within a chosen radius; shop owners manage inventory and orders from a
dashboard. See `docs/closeby-ai-roadmap-steps.txt` for where this is headed
next: AI helpers that draft (never write) — a human always confirms before
anything changes.

## Stack

- **Next.js 15** (App Router) + **React 19**, TypeScript
- **Clerk** — authentication (email one-time code, no passwords)
- **Supabase**
  - **Postgres** — all app data (users, shops, products, orders); schema in
    `supabase/migrations/`
  - **Storage** — product photos (public `product-images` bucket)
  - **Realtime** — live order signals (order status, incoming-order alerts)
  - Only the Next.js server reads/writes the database (direct Postgres
    connection); the browser's public key can't touch any table
- **Tailwind CSS v4** + shadcn-style components (`radix-ui` today, migrating
  to `@base-ui/react` — Step 1.8 of the roadmap)
- **Zod** for all input validation, **react-hook-form** for forms
- **Vitest** for unit tests

## Getting started

### 1. Clone and install

```bash
npm install
```

### 2. Create a Supabase project

1. [Create a project](https://supabase.com/dashboard) (the free plan is
   fine). Save the **database password** you choose.
2. **Connect** (top of the dashboard) > **Transaction pooler** — copy the
   connection string (port 6543) into `DATABASE_URL`, with your password
   filled in.
3. **Project Settings > API** — copy the **Project URL**
   (`NEXT_PUBLIC_SUPABASE_URL`), the **anon / publishable** key
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) and the **service_role / secret** key
   (`SUPABASE_SERVICE_ROLE_KEY` — server only, never commit it).

### 3. Create a Clerk application

1. [Create an application](https://dashboard.clerk.com/).
2. Enable **email one-time code** as a sign-in/sign-up method (this app is
   passwordless from the user's side).
3. **API Keys** — copy the publishable and secret keys.

### 4. Set environment variables

```bash
cp .env.local.example .env.local
```

Fill in the values from steps 2–3. `.env.local.example` lists every
variable name this app reads — nothing else is required. `.env.local` is
git-ignored; never commit real keys.

### 4b. Online payments

Checkout offers **Pay online** out of the box through a built-in **demo
gateway** (`src/lib/payments/demo.ts`, `src/components/payments/demo-checkout.tsx`):
a realistic payment sheet — UPI QR with countdown, UPI ID, card with OTP —
that moves no real money. The QR encodes a demo code, not a UPI address, so
a real UPI app can't pay it. Test credentials, as on real gateways:

| Method | Pays | Declines |
|---|---|---|
| UPI QR | "Simulate successful scan & pay" | — |
| UPI ID | `success@demo` | `failure@demo` |
| Card | `4111 1111 1111 1111`, any future expiry, any CVV, OTP `123456` | `4000 0000 0000 0002` |

To take real payments instead, add Razorpay keys — the app switches to
Razorpay automatically:

1. [Razorpay dashboard](https://dashboard.razorpay.com/) > **Account &
   Settings > API Keys** (test keys start with `rzp_test_`).
2. `.env.local` (server only): `RAZORPAY_KEY_ID=...`, `RAZORPAY_KEY_SECRET=...`.
3. Deployed site: **Webhooks > Add** `https://<your-site>/api/webhooks/razorpay`
   (events `payment.captured`, `refund.processed`), secret in
   `RAZORPAY_WEBHOOK_SECRET`.

`PAYMENTS_DEMO=off` hides "Pay online" when there are no Razorpay keys.

How it works (both gateways): an online order holds its stock but stays
hidden from the shop until the payment is confirmed server-side
(`src/lib/payments/orders.ts`); unpaid after 15 minutes it's cancelled and
the stock returned. A paid order that's rejected or cancelled is refunded
in full automatically. `npm run payouts` lists what each shop is owed.

### 5. Create the tables and seed reference data

```bash
npm run db:migrate        # applies supabase/migrations/*.sql (safe to re-run)
npm run seed:localities   # the localities table (tags a shop's neighbourhood)
npm run seed:test-shop    # optional: "Sharma General Store" with 106 products
```

`npm run seed:test-shop -- --claim` (after signing up as a shop owner) makes
your account the owner of the test shop.

### 6. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up as a buyer or
a shop owner from the landing page.

## Testing

```bash
npm run test          # unit tests (no external services needed)
```

## Other useful scripts

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run build        # production build
```

## Folder map

```
src/
  actions/     Server actions ("use server") — the only code that writes to
               the database. One file per domain: orders, products, shops, users.
  app/         Next.js App Router pages. Route groups roughly split by role:
               dashboard/ (shop owner), orders/ + shops/ + cart/ + checkout/
               (buyer), shop/onboarding/ (owner sign-up flow).
  components/  UI, grouped by area (buyer/, dashboard/, orders/, ui/, ...).
  lib/         Everything else: db/ (Postgres client + row mappers),
               supabase/ (storage + realtime), validation schemas
               (zod), geo (geohash + nearby search), auth guards, rate
               limiting, money formatting, order-status transitions.
  types/       Shared TypeScript types — the shape of every table row.
supabase/      migrations/ — the database schema, applied by npm run db:migrate.
tests/         Vitest unit tests.
scripts/       One-off/dev scripts (migrations, seeding, sample inventory).
docs/          Product/engineering docs, including the AI roadmap.
```

## How writes are kept honest

Every database read and write goes through server code (`src/actions/`,
`src/lib/`) over a direct Postgres connection, after its own Clerk auth and
ownership checks. Row Level Security is on for every table with no policies,
so the public key the browser holds can't read or write anything. A buyer's
browser can never set an order's status, mark a shop live, or change a
price directly. Order placement and status changes run in real Postgres
transactions with the rows locked, so stock can't be oversold.

## One login system

Clerk owns authentication; the `users` table owns the app's own `role`
field (there is no server-side way to read Clerk's `publicMetadata` from the
default session token without a dashboard-side change, so role is never
read from Clerk — see `src/lib/auth/guards.ts`). Supabase never sees a
login at all: live updates are Realtime broadcast signals sent by a database
trigger (ids + status only, see `supabase/migrations/0001_init.sql`), and
the browser re-reads the order through a server action that checks access.

## Roadmap

`docs/closeby-ai-roadmap-steps.txt` is the working plan for adding AI
helpers (owner: photo/voice → draft stock list, order accept/reject
suggestions; buyer: natural-language search, sentence → cart). Every helper
follows the same rule: **the AI drafts, a human confirms, and an existing
server action makes the change** — never the model itself.

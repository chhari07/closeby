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
- **Firebase**
  - **Firestore** — all app data (users, shops, products, orders)
  - **Storage** — product photos
  - The **Admin SDK** is the only thing that ever writes to Firestore; the
    client SDK is read-only (see `firestore.rules`) and is used for
    real-time listeners (live order status, incoming-order alerts)
- **Tailwind CSS v4** + shadcn-style components (`radix-ui` today, migrating
  to `@base-ui/react` — Step 1.8 of the roadmap)
- **Zod** for all input validation, **react-hook-form** for forms
- **Vitest** for unit tests, `@firebase/rules-unit-testing` for security
  rules tests

## Getting started

### 1. Clone and install

```bash
npm install
```

### 2. Create a Firebase project

1. [Create a project](https://console.firebase.google.com/) (or use an
   existing one).
2. Enable **Firestore** (production mode) and **Storage**.
3. **Project settings > General > Your apps** — add a Web app and copy the
   `NEXT_PUBLIC_FIREBASE_*` config values.
4. **Project settings > Service accounts > Generate new private key** —
   downloads a JSON file with the `FIREBASE_ADMIN_*` values. **Never commit
   this file** — copy the three values into `.env.local` and delete it.
5. Deploy the rules and indexes in this repo (or paste them into the
   console): `firestore.rules`, `firestore.indexes.json`, `storage.rules`.

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

### 5. Seed reference data

```bash
npm run seed:localities
```

Populates the `localities` collection (used to tag a shop's neighbourhood)
from `scripts/seed-localities.ts`.

### 6. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up as a buyer or
a shop owner from the landing page.

## Testing

```bash
npm run test          # unit tests (no external services needed)
npm run test:rules    # Firestore security-rules tests, via the local emulator
```

`test:rules` needs a JRE (the Firestore emulator runs on it) — install one
if `firebase emulators:exec` can't find `java`. It needs no real Firebase
project or credentials; the emulator is fully local.

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
               Firestore. One file per domain: orders, products, shops, users.
  app/         Next.js App Router pages. Route groups roughly split by role:
               dashboard/ (shop owner), orders/ + shops/ + cart/ + checkout/
               (buyer), shop/onboarding/ (owner sign-up flow).
  components/  UI, grouped by area (buyer/, dashboard/, orders/, ui/, ...).
  lib/         Everything else: firebase clients, validation schemas
               (zod), geo (geohash + nearby search), auth guards, rate
               limiting, money formatting, order-status transitions.
  types/       Shared TypeScript types — the shape of every Firestore doc.
tests/         Vitest unit tests + the Firestore rules test suite.
scripts/       One-off/dev scripts (seeding, sample inventory generation).
docs/          Product/engineering docs, including the AI roadmap.
```

## How writes are kept honest

Every Firestore write goes through a server action in `src/actions/`, using
the Admin SDK, which bypasses `firestore.rules` entirely — that's what makes
the rules safe to write as "the client can only ever read." A buyer's
browser can never set an order's status, mark a shop live, or change a
price directly; see `firestore.rules` and `tests/firestore.rules.test.ts`.

## Two login systems, one identity

Clerk owns authentication; Firestore owns the app's own `role` field (there
is no server-side way to read Clerk's `publicMetadata` from the default
session token without a dashboard-side change, so role is never read from
Clerk — see `src/lib/auth/guards.ts`). Client-side Firestore listeners
(live order status, incoming-order alerts) need a **separate** Firebase Auth
session: `src/components/firebase-auth-sync.tsx` mints one from the active
Clerk session via `/api/firebase-token`, so `request.auth.uid` in
`firestore.rules` always matches the signed-in Clerk user.

## Roadmap

`docs/closeby-ai-roadmap-steps.txt` is the working plan for adding AI
helpers (owner: photo/voice → draft stock list, order accept/reject
suggestions; buyer: natural-language search, sentence → cart). Every helper
follows the same rule: **the AI drafts, a human confirms, and an existing
server action makes the change** — never the model itself.

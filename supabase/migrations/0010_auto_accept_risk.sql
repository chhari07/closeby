-- Step 5.1 (owner-approved auto-accept) and Step 5.2 (fake / abusive order flags).

-- The owner's auto-accept rules; null = never set up (off).
-- { enabled, maxOrderValue (paise), paymentMethods: ("cod"|"pay_at_shop"|"online")[] }
alter table shops add column if not exists auto_accept jsonb;

-- Warnings for the owner, worked out when the order reaches the shop:
-- [{ code, level: "warn" | "high", text }]. Never shown to the buyer, never
-- blocks the order by itself: the owner decides.
alter table orders add column if not exists risk_flags jsonb not null default '[]'::jsonb;
-- When the owner pressed "Looks fine" on the warnings.
alter table orders add column if not exists risk_reviewed_at bigint;

-- Buyer history look-ups for the risk checks.
create index if not exists orders_buyer_status_idx on orders (buyer_id, status, created_at desc);

-- Step 5.6: AI cost / error dashboards read runs by time.
create index if not exists ai_runs_created_idx on ai_runs (created_at desc);

-- CloseBy on Supabase: tables, indexes, storage bucket and realtime signals.
--
-- Access model (same idea as the old Firestore rules, "all writes go through
-- server actions"): the Next.js server talks to Postgres directly with the
-- database connection string (src/lib/db/client.ts) and does every read and
-- write itself, after its own Clerk auth + ownership checks. RLS is ON for
-- every table with NO policies, so the public anon key used in the browser
-- can't read or write any table at all.
--
-- Times are epoch milliseconds (bigint), matching the app's `number` fields.
-- Apply with `npm run db:migrate` (or paste into the Supabase SQL editor).

create table if not exists users (
  id                  text primary key,              -- Clerk user id
  role                text check (role in ('buyer', 'shop_owner')),
  name                text not null default '',
  phone               text not null default '',
  saved_addresses     jsonb not null default '[]'::jsonb,
  last_known_location jsonb,
  created_at          bigint not null,
  updated_at          bigint not null
);

create table if not exists localities (
  id      text primary key,
  name    text not null,
  city    text not null,
  center  jsonb not null,                           -- { lat, lng }
  geohash text not null
);

create table if not exists shops (
  id                  text primary key default gen_random_uuid()::text,
  owner_id            text not null unique,          -- one shop per owner (getMyShop)
  status              text not null default 'draft' check (status in ('draft', 'live')),
  onboarding_step     int  not null default 1,
  is_open             boolean not null default false,
  type                text,
  name                text not null default '',
  phone               text not null default '',
  hours               jsonb,                          -- { open, close, days }
  location            jsonb,                          -- { lat, lng, geohash, address, localityId }
  item_count          int not null default 0,
  order_count         int not null default 0,
  pending_order_count int not null default 0,
  created_at          bigint not null,
  updated_at          bigint not null
);
create index if not exists shops_status_idx on shops (status);

create table if not exists products (
  id                text primary key default gen_random_uuid()::text,
  shop_id           text not null references shops (id) on delete cascade,
  name              text not null,
  price             int  not null,                   -- paise
  unit              text not null,
  category          text not null,
  stock             int  not null default 0,
  in_stock          boolean not null default false,
  image_url         text,
  brand             text,
  description       text,
  mrp               int,                              -- paise
  aliases           text[],
  last_restocked_at bigint,
  updated_at        bigint not null
);
create index if not exists products_shop_updated_idx on products (shop_id, updated_at desc);
create index if not exists products_shop_stock_idx on products (shop_id, stock);

create table if not exists orders (
  id               text primary key default gen_random_uuid()::text,
  buyer_id         text not null,
  shop_id          text not null references shops (id),
  shop_name        text not null,
  buyer_name       text not null,
  buyer_phone      text not null,
  items            jsonb not null,                    -- OrderItem[]
  item_total       int  not null,                     -- paise
  status           text not null,
  timeline         jsonb not null,                    -- OrderTimelineEntry[]
  delivery_address jsonb not null,
  payment_method   text not null,
  rejection_reason text,
  stock_reserved   boolean not null default false,
  created_at       bigint not null,
  updated_at       bigint not null
);
create index if not exists orders_shop_created_idx on orders (shop_id, created_at desc);
create index if not exists orders_buyer_created_idx on orders (buyer_id, created_at desc);

-- --- AI foundation -------------------------------------------------------

create table if not exists ai_runs (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  helper        text not null,
  model         text not null,
  input_summary text not null,
  tools_used    text[] not null default '{}',
  tokens_in     int not null default 0,
  tokens_out    int not null default 0,
  cost_usd      double precision not null default 0,
  latency_ms    int not null default 0,
  result        text not null,
  error_message text,
  created_at    bigint not null
);
create index if not exists ai_runs_user_idx on ai_runs (user_id, created_at desc);

create table if not exists approvals (
  id         text primary key default gen_random_uuid()::text,
  user_id    text not null,
  shop_id    text,
  type       text not null,
  draft      jsonb not null,
  status     text not null default 'pending',
  edited     boolean,
  created_at bigint not null,
  decided_at bigint,
  expires_at bigint not null
);
create index if not exists approvals_user_status_idx on approvals (user_id, status, created_at desc);

create table if not exists ai_usage (
  user_id  text not null,
  date     text not null,                          -- YYYY-MM-DD (UTC)
  cost_usd double precision not null default 0,
  requests int not null default 0,
  primary key (user_id, date)
);

-- id = helper name (global) or `${helper}__${shopId}` (per-shop override)
create table if not exists ai_settings (
  id              text primary key,
  helper          text not null,
  shop_id         text,
  enabled         boolean not null default true,
  daily_limit_usd double precision
);

-- --- Lock the public API down (see header) --------------------------------

alter table users       enable row level security;
alter table localities  enable row level security;
alter table shops       enable row level security;
alter table products    enable row level security;
alter table orders      enable row level security;
alter table ai_runs     enable row level security;
alter table approvals   enable row level security;
alter table ai_usage    enable row level security;
alter table ai_settings enable row level security;

-- --- Product photos --------------------------------------------------------
-- Public read (shown on shop pages). Uploads only happen through a signed
-- upload URL the server hands out after checking shop ownership
-- (createProductImageUpload in src/actions/products.ts), so no storage
-- policies are needed; the bucket itself caps size and type.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- --- Live order signals ------------------------------------------------------
-- Replaces the Firestore onSnapshot listeners. Every order insert/update sends
-- a tiny Realtime broadcast that carries only ids + status, never order
-- contents; the browser then re-reads the order through a server action that
-- checks the caller may see it. Topics:
--   shop-orders:<shopId>   the shop dashboard (list + new-order alert)
--   buyer-orders:<buyerId> the buyer's site-wide status alerts
--   order:<orderId>        one order's live timeline

create or replace function notify_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  payload jsonb := jsonb_build_object(
    'id', new.id,
    'status', new.status,
    'op', tg_op,
    'previousStatus', case when tg_op = 'UPDATE' then old.status end
  );
begin
  begin
    perform realtime.send(payload, 'order', 'shop-orders:' || new.shop_id, false);
    perform realtime.send(payload, 'order', 'buyer-orders:' || new.buyer_id, false);
    perform realtime.send(payload, 'order', 'order:' || new.id, false);
  exception when others then
    -- A missed live signal must never block the order write itself; the
    -- pages still show the right data on the next load.
    raise warning 'notify_order_change: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists orders_notify on orders;
create trigger orders_notify
  after insert or update on orders
  for each row execute function notify_order_change();

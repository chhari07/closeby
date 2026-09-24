-- Buyer <-> shop chat, one conversation per order. Written only by the
-- server (sendOrderMessage in src/actions/messages.ts) after checking the
-- sender is that order's buyer or the shop's owner; RLS on, no policies.

create table if not exists order_messages (
  id         text primary key default gen_random_uuid()::text,
  order_id   text not null references orders (id) on delete cascade,
  sender     text not null check (sender in ('buyer', 'shop')),
  sender_id  text not null,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at bigint not null
);
create index if not exists order_messages_order_idx on order_messages (order_id, created_at);
alter table order_messages enable row level security;

-- Per-order read markers, for unread counts on each side. Buyers start
-- from their old whole-inbox marker so nothing already seen turns unread.
alter table orders add column if not exists buyer_read_at bigint not null default 0;
alter table orders add column if not exists shop_read_at  bigint not null default 0;
update orders o set buyer_read_at = u.messages_read_at
  from users u where u.id = o.buyer_id and o.buyer_read_at = 0;

-- Live chat: same public-broadcast pattern as notify_order_change — ids
-- only, the browser re-reads the conversation through a checked server action.
create or replace function notify_order_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o record;
  payload jsonb;
begin
  select shop_id, buyer_id into o from orders where id = new.order_id;
  payload := jsonb_build_object('orderId', new.order_id, 'messageId', new.id, 'sender', new.sender);
  begin
    perform realtime.send(payload, 'message', 'shop-orders:' || o.shop_id, false);
    perform realtime.send(payload, 'message', 'buyer-orders:' || o.buyer_id, false);
    perform realtime.send(payload, 'message', 'order:' || new.order_id, false);
  exception when others then
    raise warning 'notify_order_message: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists order_messages_notify on order_messages;
create trigger order_messages_notify
  after insert on order_messages
  for each row execute function notify_order_message();

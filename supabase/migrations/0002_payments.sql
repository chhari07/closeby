-- Online payments (Razorpay). Money lands in the CloseBy Razorpay account;
-- what each shop is owed is worked out from these columns (npm run payouts).
--
-- payment_status:
--   none            cash on delivery / pay at shop — nothing online
--   pending         online order placed, stock reserved, waiting for payment
--                   (hidden from the shop until paid; expires after 15 min)
--   paid            captured in Razorpay
--   expired         never paid; order auto-cancelled, stock returned
--   refund_pending  paid order rejected/cancelled; refund being requested
--   refunded        refund accepted by Razorpay
--   refund_failed   refund call failed — refund it from the Razorpay dashboard

alter table orders add column if not exists payment_status text not null default 'none'
  check (payment_status in ('none', 'pending', 'paid', 'expired', 'refund_pending', 'refunded', 'refund_failed'));
alter table orders add column if not exists razorpay_order_id text unique;
alter table orders add column if not exists razorpay_payment_id text;
alter table orders add column if not exists razorpay_refund_id text;
alter table orders add column if not exists paid_at bigint;

create index if not exists orders_payment_pending_idx on orders (created_at) where payment_status = 'pending';

-- The live signal now also carries the payment status, so the shop's
-- new-order alert fires when an online order is PAID, not when it's placed.
create or replace function notify_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  payload jsonb := jsonb_build_object(
    'id', new.id,
    'status', new.status,
    'op', tg_op,
    'previousStatus', case when tg_op = 'UPDATE' then old.status end,
    'paymentStatus', new.payment_status,
    'previousPaymentStatus', case when tg_op = 'UPDATE' then old.payment_status end
  );
begin
  begin
    perform realtime.send(payload, 'order', 'shop-orders:' || new.shop_id, false);
    perform realtime.send(payload, 'order', 'buyer-orders:' || new.buyer_id, false);
    perform realtime.send(payload, 'order', 'order:' || new.id, false);
  exception when others then
    raise warning 'notify_order_change: %', sqlerrm;
  end;
  return new;
end;
$$;

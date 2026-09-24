-- Payments can come from Razorpay or the built-in demo gateway
-- (src/lib/payments/demo.ts — used when no Razorpay keys are set), so the
-- gateway-specific column names become generic.

alter table orders rename column razorpay_order_id to gateway_order_id;
alter table orders rename column razorpay_payment_id to gateway_payment_id;
alter table orders rename column razorpay_refund_id to gateway_refund_id;

-- Which gateway took the payment ('razorpay' | 'demo'); null for cash orders.
alter table orders add column if not exists payment_provider text
  check (payment_provider in ('razorpay', 'demo'));
-- How it was paid, for the bill: "UPI", "Card •••• 1111", ...
alter table orders add column if not exists payment_detail text;

update orders set payment_provider = 'razorpay' where gateway_order_id is not null and payment_provider is null;

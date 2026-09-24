import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { markRazorpayOrderPaid } from "@/lib/payments/orders";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (public route — see /api/webhooks in src/middleware.ts).
 * Backup for the browser's own confirmation: if the buyer pays and closes
 * the tab before the app hears back, this still marks the order paid.
 * Needs RAZORPAY_WEBHOOK_SECRET and a public URL, so it's for the deployed
 * site; locally, expireUnpaidOrders asks Razorpay directly instead.
 *
 * Razorpay dashboard > Webhooks: URL https://<your-site>/api/webhooks/razorpay,
 * events payment.captured + refund.processed, same secret as the env var.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(raw) as {
    event: string;
    payload: {
      payment?: { entity: { id: string; order_id: string } };
      refund?: { entity: { id: string; payment_id: string } };
    };
  };

  try {
    if (event.event === "payment.captured" || event.event === "payment.authorized") {
      const payment = event.payload.payment?.entity;
      if (payment?.order_id) {
        const [row] = await db()`select id from orders where gateway_order_id = ${payment.order_id}`;
        if (row) await markRazorpayOrderPaid(row.id as string, payment.id);
      }
    } else if (event.event === "refund.processed") {
      const refund = event.payload.refund?.entity;
      if (refund) {
        await db()`
          update orders set payment_status = 'refunded', gateway_refund_id = ${refund.id}, updated_at = ${Date.now()}
          where gateway_payment_id = ${refund.payment_id} and payment_status in ('refund_pending', 'refund_failed')
        `;
      }
    }
  } catch (err) {
    // 500 makes Razorpay retry later.
    console.error("[razorpay webhook]", event.event, err);
    return NextResponse.json({ error: "Could not process" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

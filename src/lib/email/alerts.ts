import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { findOrder, findShop } from "@/lib/db/rows";
import { formatPaise } from "@/lib/money";
import { sendEmail } from "./send";
import type { OrderDoc, OrderStatus } from "@/types";

/**
 * Step 5.4 — alerts by email when the person isn't on the site. While any
 * CloseBy tab is open it refreshes users.last_seen_at every minute (and
 * zeroes it when the last tab closes); the in-page sound/toast covers them
 * then. Only when they're away does an event here turn into an email.
 * Duplicates are impossible (email_alert_log) and chat is throttled.
 */

/** No heartbeat for this long = the site is closed. */
export const AWAY_AFTER_MS = 150_000;
/** At most one chat email per conversation per recipient in this window. */
export const CHAT_EMAIL_EVERY_MS = 10 * 60_000;

export function isAway(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt > AWAY_AFTER_MS;
}

// --- plumbing ----------------------------------------------------------------

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch {
    // outside a request (scripts)
  }
  return "http://localhost:3000";
}

/**
 * Runs an alert after the response is sent (so the buyer/owner never waits
 * for Gmail), or right away when called outside a request (scripts/tests).
 * Failures are logged, never thrown — an email must not break an order.
 */
export async function queueAlert(task: (base: string) => Promise<void>): Promise<void> {
  const base = await baseUrl();
  const run = () => task(base).catch((err) => console.error("[email alert] failed", err));
  try {
    after(run);
  } catch {
    await run();
  }
}

interface Recipient {
  userId: string;
  name: string;
  email: string;
}

/** The person, if they're away, want email alerts, and Clerk has an address for them. */
async function awayRecipient(userId: string): Promise<Recipient | null> {
  const [user] = await db()`select name, last_seen_at, email_alerts from users where id = ${userId}`;
  if (!user || user.emailAlerts === false || !isAway(user.lastSeenAt as number, Date.now())) return null;
  try {
    const clerkUser = await (await clerkClient()).users.getUser(userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress;
    return email ? { userId, name: (user.name as string) || "there", email } : null;
  } catch {
    return null; // not a Clerk account (e.g. test data)
  }
}

/** Claims an alert key; false if it was already sent (within `everyMs`, if given). */
async function claim(key: string, everyMs?: number): Promise<boolean> {
  const now = Date.now();
  const rows = everyMs
    ? await db()`
        insert into email_alert_log (key, sent_at) values (${key}, ${now})
        on conflict (key) do update set sent_at = excluded.sent_at
        where email_alert_log.sent_at < ${now - everyMs}
        returning key`
    : await db()`insert into email_alert_log (key, sent_at) values (${key}, ${now}) on conflict (key) do nothing returning key`;
  return rows.length > 0;
}

// --- email look ----------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderAlert(opts: { heading: string; lines: string[]; button: { label: string; url: string }; name: string }) {
  const text = [`Hi ${opts.name},`, "", opts.heading, ...opts.lines, "", `${opts.button.label}: ${opts.button.url}`, "", "— CloseBy · You get this because you weren't on the site. Turn email alerts off in your Profile."].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#14532d;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold">CloseBy</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px">Hi ${esc(opts.name)},</p>
<p style="margin:0 0 12px;font-size:18px;font-weight:bold">${esc(opts.heading)}</p>
${opts.lines.map((l) => `<p style="margin:0 0 8px;color:#3f3f46">${esc(l)}</p>`).join("")}
<p style="margin:20px 0 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${esc(opts.button.label)}</a></p>
</td></tr>
<tr><td style="padding:12px 24px 20px;color:#71717a;font-size:12px">You got this because you weren't on CloseBy when it happened. Turn email alerts off any time in your Profile.</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text };
}

const orderRef = (o: OrderDoc) => `#${o.id.slice(0, 8).toUpperCase()}`;
const itemsLine = (o: OrderDoc) => {
  const units = o.items.reduce((n, i) => n + i.qty, 0);
  return `${units} item${units === 1 ? "" : "s"} · ${formatPaise(o.itemTotal)}${o.paymentMethod === "online" ? " · paid online" : ""}`;
};

// --- the alerts ------------------------------------------------------------------

/** Owner: a new order reached the shop (placed, or an online order just paid). */
export async function alertShopNewOrder(orderId: string, base: string): Promise<void> {
  const order = await findOrder(orderId);
  const shop = order ? await findShop(order.shopId) : null;
  if (!order || !shop) return;
  const to = await awayRecipient(shop.ownerId);
  if (!to || !(await claim(`new-order:${orderId}`))) return;
  const autoAccepted = order.status === "ACCEPTED" && order.timeline.some((t) => t.status === "ACCEPTED" && t.auto);
  const { html, text } = renderAlert({
    name: to.name,
    heading: `New order from ${order.buyerName || "a buyer"}`,
    lines: [
      `Order ${orderRef(order)} · ${itemsLine(order)}`,
      ...order.items.slice(0, 6).map((i) => `• ${i.name} (${i.unit}) × ${i.qty}`),
      ...(order.riskFlags ?? []).map((f) => `⚠ ${f.text}`),
      autoAccepted
        ? "Accepted automatically by your auto-accept rules — start preparing it."
        : order.riskFlags?.length
          ? "Check the warnings above before you accept it."
          : "Accept or reject it soon — the buyer is waiting.",
    ],
    button: { label: "Open orders", url: `${base}/dashboard/orders` },
  });
  await sendEmail({ to: to.email, subject: `🛒 New order ${orderRef(order)} — ${itemsLine(order)}`, html, text });
}

const UPDATE_TEXT: Partial<Record<OrderStatus, { subject: string; heading: string }>> = {
  ACCEPTED: { subject: "accepted", heading: "Your order was accepted" },
  READY: { subject: "is ready for pickup", heading: "Your order is ready for pickup" },
  COMPLETED: { subject: "is complete", heading: "Your order is complete" },
  REJECTED: { subject: "was rejected", heading: "The shop couldn't take your order" },
  CANCELLED: { subject: "was cancelled", heading: "Your order was cancelled" },
};

/** Buyer: the shop moved their order on (Preparing isn't worth an email). */
export async function alertBuyerOrderUpdate(orderId: string, status: OrderStatus, base: string): Promise<void> {
  const text = UPDATE_TEXT[status];
  const order = await findOrder(orderId);
  if (!text || !order) return;
  const to = await awayRecipient(order.buyerId);
  if (!to || !(await claim(`update:${orderId}:${status}`))) return;
  const reason = (status === "REJECTED" || status === "CANCELLED") && order.rejectionReason ? [`Reason: ${order.rejectionReason}`] : [];
  const refund = (status === "REJECTED" || status === "CANCELLED") && order.paymentMethod === "online" && order.paidAt ? ["Your online payment is being refunded in full."] : [];
  const mail = renderAlert({
    name: to.name,
    heading: text.heading,
    lines: [`${order.shopName} · Order ${orderRef(order)} · ${itemsLine(order)}`, ...reason, ...refund],
    button: { label: "View order", url: `${base}/orders/${orderId}` },
  });
  await sendEmail({ to: to.email, subject: `Your order from ${order.shopName} ${text.subject}`, ...mail });
}

/** Buyer: a refund went through. */
export async function alertBuyerRefund(orderId: string, base: string): Promise<void> {
  const order = await findOrder(orderId);
  if (!order) return;
  // When the SHOP rejected/cancelled it, the status email already said the
  // money is coming back — one email is enough.
  if (order.timeline.at(-1)?.by === "shop") return;
  const to = await awayRecipient(order.buyerId);
  if (!to || !(await claim(`refund:${orderId}`))) return;
  const mail = renderAlert({
    name: to.name,
    heading: `Refund issued: ${formatPaise(order.itemTotal)}`,
    lines: [`For your order ${orderRef(order)} from ${order.shopName}.`, "It usually reaches your original payment method in 5–7 working days."],
    button: { label: "View order", url: `${base}/orders/${orderId}` },
  });
  await sendEmail({ to: to.email, subject: `Refund of ${formatPaise(order.itemTotal)} for your CloseBy order`, ...mail });
}

/** A chat message for someone who's away — at most one email per conversation every 10 minutes. */
export async function alertChatMessage(orderId: string, sender: "buyer" | "shop", body: string, base: string): Promise<void> {
  const order = await findOrder(orderId);
  const shop = order ? await findShop(order.shopId) : null;
  if (!order || !shop) return;
  const recipientId = sender === "buyer" ? shop.ownerId : order.buyerId;
  const to = await awayRecipient(recipientId);
  if (!to || !(await claim(`chat:${orderId}:${recipientId}`, CHAT_EMAIL_EVERY_MS))) return;
  const from = sender === "buyer" ? order.buyerName || "Your buyer" : order.shopName;
  const mail = renderAlert({
    name: to.name,
    heading: `New message from ${from}`,
    lines: [`“${body.length > 300 ? `${body.slice(0, 300)}…` : body}”`, `About order ${orderRef(order)}.`],
    button: {
      label: "Reply",
      url: sender === "buyer" ? `${base}/dashboard/orders` : `${base}/messages/${orderId}`,
    },
  });
  await sendEmail({ to: to.email, subject: `💬 ${from}: ${body.slice(0, 60)}${body.length > 60 ? "…" : ""}`, ...mail });
}

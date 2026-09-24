import "server-only";
import { formatPaise } from "@/lib/money";
import type { ConversationView } from "@/actions/messages";
import type { OrderDoc } from "@/types";

/** Most recent conversation lines the reply helper sees. */
const MAX_LINES = 20;
const MAX_LINE_CHARS = 300;

/**
 * Context for the chatReply helper, built on the server from the real order
 * and conversation (never from anything the browser sends, apart from the
 * user's own unsent draft). `trusted` goes outside the <data> tags — whose
 * side we write for and the order facts; `data` is the chat itself, which
 * people typed and so stays inside <data>.
 */
export function buildChatReplyContext(
  view: ConversationView,
  order: OrderDoc,
  draft: string,
): { trusted: string; data: string } {
  const who =
    view.viewer === "buyer"
      ? `the BUYER (${order.buyerName || "the buyer"}) writing to the shop "${order.shopName}"`
      : `the SHOP OWNER of "${order.shopName}" writing to the buyer ${order.buyerName || ""}`.trim();
  const items = order.items.map((i) => `${i.name} (${i.unit}) × ${i.qty}`).join(", ");
  const payment =
    order.paymentMethod === "online"
      ? `paid online (${order.paymentStatus ?? "unknown"})`
      : order.paymentMethod === "cod"
        ? "cash on delivery"
        : "pay at shop";
  const trusted =
    `Write replies for ${who}. Order #${order.id.slice(0, 8).toUpperCase()}: status ${order.status}, ` +
    `items: ${items || "none"}, total ${formatPaise(order.itemTotal)}, payment: ${payment}` +
    `${order.rejectionReason ? `, reason given: ${order.rejectionReason}` : ""}.`;

  const lines = view.items.slice(-MAX_LINES).map((item) => {
    if (item.type === "alert") return `[order update] ${item.alert.title}`;
    const speaker = item.chat.sender === view.viewer ? "ME" : item.chat.sender === "buyer" ? "BUYER" : "SHOP";
    return `${speaker}: ${item.chat.body.replace(/\s+/g, " ").slice(0, MAX_LINE_CHARS)}`;
  });
  const cleanDraft = draft.replace(/\s+/g, " ").trim().slice(0, MAX_LINE_CHARS);
  const data = `${lines.join("\n") || "(no messages yet)"}${cleanDraft ? `\nDRAFT (ME, not sent yet): ${cleanDraft}` : ""}`;
  return { trusted, data };
}

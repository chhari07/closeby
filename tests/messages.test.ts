import { describe, expect, it } from "vitest";
import { buildConversation, buildMessages, buildThread, isUnread, isUnreadFor, messagesForOrder } from "../src/lib/messages";
import type { OrderDoc } from "../src/types";

const base: OrderDoc = {
  id: "abcdef1234",
  buyerId: "buyer",
  shopId: "shop",
  shopName: "Sharma General Store",
  buyerName: "Aman",
  buyerPhone: "9999999999",
  items: [{ productId: "p1", name: "Rice", unit: "1 kg", price: 5000, qty: 2 }],
  itemTotal: 10000,
  status: "PLACED",
  timeline: [{ status: "PLACED", at: 1000, by: "buyer" }],
  deliveryAddress: { line1: "x", landmark: "", lat: 0, lng: 0 },
  paymentMethod: "cod",
  paymentStatus: "none",
  createdAt: 1000,
  updatedAt: 1000,
};

describe("buyer messages", () => {
  it("turns every past status change into a message, including the buyer's own placement", () => {
    const order: OrderDoc = {
      ...base,
      status: "COMPLETED",
      timeline: [
        { status: "PLACED", at: 1000, by: "buyer" },
        { status: "ACCEPTED", at: 2000, by: "shop" },
        { status: "PREPARING", at: 3000, by: "shop" },
        { status: "READY", at: 4000, by: "shop" },
        { status: "COMPLETED", at: 5000, by: "shop" },
      ],
    };
    const msgs = messagesForOrder(order);
    expect(msgs.map((m) => m.kind)).toEqual(["PLACED", "ACCEPTED", "PREPARING", "READY", "COMPLETED"]);
    expect(msgs[0]!.body).toContain("2 items · ₹100.00");
    expect(msgs[1]!.body).toBe("Sharma General Store accepted your order.");
  });

  it("includes the shop's rejection reason", () => {
    const msgs = messagesForOrder({
      ...base,
      status: "REJECTED",
      timeline: [...base.timeline, { status: "REJECTED", at: 2000, by: "shop", reason: "Item(s) out of stock" }],
    });
    expect(msgs.at(-1)!.body).toContain("Reason: Item(s) out of stock");
  });

  it("adds payment and refund messages for online orders", () => {
    const msgs = messagesForOrder({
      ...base,
      paymentMethod: "online",
      paymentStatus: "refunded",
      paymentDetail: "UPI · success@demo",
      paidAt: 1500,
      status: "REJECTED",
      timeline: [...base.timeline, { status: "REJECTED", at: 3000, by: "shop" }],
      updatedAt: 3100,
    });
    expect(msgs.find((m) => m.kind === "PAID")!.body).toBe(
      "₹100.00 paid via UPI · success@demo for your order from Sharma General Store.",
    );
    expect(msgs.find((m) => m.kind === "REFUNDED")!.at).toBe(3100);
  });

  it("explains an order cancelled for a missed payment, and counts it as news", () => {
    const [, cancelled] = messagesForOrder({
      ...base,
      paymentMethod: "online",
      paymentStatus: "expired",
      status: "CANCELLED",
      timeline: [...base.timeline, { status: "CANCELLED", at: 2000, by: "buyer", reason: "Payment not completed in time" }],
    });
    expect(cancelled!.body).toContain("payment wasn't completed");
    expect(cancelled!.fromBuyer).toBe(false);
  });

  it("sorts newest first and never marks the buyer's own actions unread", () => {
    const a = { ...base, id: "a", timeline: [{ status: "PLACED" as const, at: 1000, by: "buyer" as const }] };
    const b = {
      ...base,
      id: "b",
      timeline: [
        { status: "PLACED" as const, at: 500, by: "buyer" as const },
        { status: "ACCEPTED" as const, at: 3000, by: "shop" as const },
      ],
    };
    const msgs = buildMessages([a, b]);
    expect(msgs.map((m) => m.at)).toEqual([3000, 1000, 500]);
    expect(msgs.filter((m) => isUnread(m, 0)).map((m) => m.kind)).toEqual(["ACCEPTED"]);
    expect(msgs.filter((m) => isUnread(m, 3000))).toEqual([]);
  });
});

describe("order chat threads", () => {
  const order: OrderDoc = {
    ...base,
    status: "ACCEPTED",
    timeline: [
      { status: "PLACED", at: 1000, by: "buyer" },
      { status: "ACCEPTED", at: 3000, by: "shop" },
    ],
  };
  const chat = (id: string, sender: "buyer" | "shop", at: number, body = "hi") => ({
    id,
    orderId: order.id,
    sender,
    senderId: sender,
    body,
    createdAt: at,
  });

  it("interleaves alerts and chat in time order", () => {
    const thread = buildThread(order, [chat("c1", "buyer", 2000, "Is rice in stock?"), chat("c2", "shop", 4000, "Yes!")]);
    expect(thread.map((i) => (i.type === "chat" ? i.chat.body : i.alert.kind))).toEqual([
      "PLACED",
      "Is rice in stock?",
      "ACCEPTED",
      "Yes!",
    ]);
  });

  it("counts unread per side: the buyer gets shop replies and alerts, the shop only buyer messages", () => {
    const chats = [chat("c1", "buyer", 2000), chat("c2", "shop", 4000), chat("c3", "buyer", 5000)];
    const forBuyer = buildConversation({ ...order, buyerReadAt: 1500 }, chats, "buyer");
    expect(forBuyer.unread).toBe(2); // ACCEPTED alert + shop reply; own messages never count
    const forShop = buildConversation({ ...order, shopReadAt: 4500 }, chats, "shop");
    expect(forShop.unread).toBe(1); // only the buyer's message after the shop last read
    expect(forShop.lastText).toBe("hi");
    expect(forShop.lastFrom).toBe("buyer");
  });

  it("the buyer's own messages are never unread for the buyer", () => {
    const [, mine] = buildThread(order, [chat("c1", "buyer", 2000)]);
    expect(isUnreadFor(mine!, "buyer", 0)).toBe(false);
    expect(isUnreadFor(mine!, "shop", 0)).toBe(true);
  });
});

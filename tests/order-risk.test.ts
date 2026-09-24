import { describe, expect, it } from "vitest";
import { orderRiskFlags, DAY_MS, HOUR_MS, type HistoryOrder, type RiskContext } from "../src/lib/orders/risk";
import type { OrderStatus, OrderTimelineEntry, PaymentStatus } from "../src/types";

const NOW = 1_000 * DAY_MS;
const SHOP = { lat: 24.65, lng: 77.31 }; // Guna

const ctx = (over: Partial<RiskContext> = {}, orderOver: Partial<RiskContext["order"]> = {}): RiskContext => ({
  order: {
    id: "new",
    shopId: "s1",
    items: [{ productId: "p1", name: "Milk", unit: "500 ml", price: 28_00, qty: 2 }],
    itemTotal: 56_00,
    paymentMethod: "cod",
    deliveryAddress: { line1: "x", landmark: "", lat: 24.651, lng: 77.311 },
    buyerPhone: "9876543210",
    createdAt: NOW,
    ...orderOver,
  },
  history: [],
  shopLocation: SHOP,
  shopAvgOrderValue: 300_00,
  stockLeft: { p1: 40 },
  now: NOW,
  ...over,
});

const past = (
  n: number,
  over: { status?: OrderStatus; paymentStatus?: PaymentStatus; ago?: number; shopId?: string; cancelledBy?: "buyer" | "shop" } = {},
): HistoryOrder[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `h${i}-${Math.random()}`,
    shopId: over.shopId ?? "s2",
    status: over.status ?? "COMPLETED",
    paymentMethod: "cod",
    paymentStatus: over.paymentStatus ?? "none",
    createdAt: NOW - (over.ago ?? DAY_MS * 2),
    timeline: [
      { status: "PLACED", at: 0, by: "buyer" },
      ...(over.status === "CANCELLED" ? [{ status: "CANCELLED", at: 1, by: over.cancelledBy ?? "buyer" }] : []),
    ] as OrderTimelineEntry[],
  }));

const codes = (c: RiskContext) => orderRiskFlags(c).map((f) => f.code);

describe("orderRiskFlags", () => {
  it("a normal order has no warnings", () => {
    expect(orderRiskFlags(ctx())).toEqual([]);
  });

  it("many orders in the last hour", () => {
    expect(codes(ctx({ history: past(2, { ago: 10 * 60_000 }) }))).toEqual([]);
    const flags = orderRiskFlags(ctx({ history: past(3, { ago: 10 * 60_000 }) }));
    expect(flags[0]).toMatchObject({ code: "burst", level: "warn" });
    expect(orderRiskFlags(ctx({ history: past(6, { ago: 10 * 60_000 }) }))[0]?.level).toBe("high");
    expect(codes(ctx({ history: past(5, { ago: 2 * HOUR_MS }) }))).not.toContain("burst");
  });

  it("buyer who cancels most orders", () => {
    expect(codes(ctx({ history: [...past(3, { status: "CANCELLED" }), ...past(2)] }))).toContain("cancels");
    expect(codes(ctx({ history: [...past(3, { status: "CANCELLED" }), ...past(5)] }))).not.toContain("cancels");
    // cancelled by the shop, or unpaid checkouts, aren't the buyer's cancels
    expect(codes(ctx({ history: past(4, { status: "CANCELLED", cancelledBy: "shop" }) }))).not.toContain("cancels");
    expect(codes(ctx({ history: past(4, { status: "CANCELLED", paymentStatus: "expired" }) }))).not.toContain("cancels");
  });

  it("often rejected by shops", () => {
    expect(codes(ctx({ history: past(3, { status: "REJECTED" }) }))).toContain("rejected");
    expect(codes(ctx({ history: past(2, { status: "REJECTED" }) }))).not.toContain("rejected");
  });

  it("unpaid online checkouts in the last day", () => {
    const unpaid = past(3, { status: "CANCELLED", paymentStatus: "expired", ago: 3 * HOUR_MS });
    expect(codes(ctx({ history: unpaid }))).toContain("unpaid");
    expect(codes(ctx({ history: past(3, { status: "CANCELLED", paymentStatus: "expired", ago: 2 * DAY_MS }) }))).not.toContain("unpaid");
  });

  it("big cash order from a buyer new to this shop", () => {
    const big = { itemTotal: 2500_00 };
    expect(codes(ctx({ shopAvgOrderValue: 300_00 }, big))).toContain("big_cash");
    // paid online: no cash risk
    expect(codes(ctx({}, { ...big, paymentMethod: "online" }))).not.toContain("big_cash");
    // a regular here
    expect(codes(ctx({ history: past(1, { shopId: "s1" }) }, big))).not.toContain("big_cash");
    // a shop whose usual order is big
    expect(codes(ctx({ shopAvgOrderValue: 1000_00 }, big))).not.toContain("big_cash");
    expect(orderRiskFlags(ctx({}, { itemTotal: 12_000_00 })).find((f) => f.code === "big_cash")?.level).toBe("high");
  });

  it("buying up an item's stock, or a huge quantity", () => {
    const items = [{ productId: "p1", name: "Milk", unit: "500 ml", price: 28_00, qty: 12 }];
    expect(codes(ctx({ stockLeft: { p1: 0 } }, { items }))).toContain("hoard");
    expect(codes(ctx({ stockLeft: { p1: 40 } }, { items }))).toEqual([]);
    expect(codes(ctx({ stockLeft: { p1: 200 } }, { items: [{ ...items[0]!, qty: 30 }], itemTotal: 840_00 }))).toContain("huge_qty");
    // small shop stock but small qty: not flagged
    expect(codes(ctx({ stockLeft: { p1: 0 } }, { items: [{ ...items[0]!, qty: 3 }] }))).toEqual([]);
  });

  it("delivery address far from the shop", () => {
    const far = { deliveryAddress: { line1: "x", landmark: "", lat: 24.85, lng: 77.31 } }; // ~22 km
    expect(orderRiskFlags(ctx({}, far)).find((f) => f.code === "far")?.level).toBe("warn");
    const veryFar = { deliveryAddress: { line1: "x", landmark: "", lat: 23.26, lng: 77.41 } }; // Bhopal
    expect(orderRiskFlags(ctx({}, veryFar)).find((f) => f.code === "far")?.level).toBe("high");
    // unknown location (0,0) is not "far"
    expect(codes(ctx({}, { deliveryAddress: { line1: "x", landmark: "", lat: 0, lng: 0 } }))).toEqual([]);
  });

  it("no phone number", () => {
    expect(codes(ctx({}, { buyerPhone: " " }))).toEqual(["no_phone"]);
  });

  it("ignores the order itself and anything older than 30 days", () => {
    const self = { ...past(1, { status: "REJECTED" })[0]!, id: "new" };
    const old = past(5, { status: "REJECTED", ago: 40 * DAY_MS });
    expect(codes(ctx({ history: [self, self, self, ...old] }))).toEqual([]);
  });
});

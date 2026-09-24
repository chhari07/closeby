import { describe, expect, it } from "vitest";
import { clampIdea, ideaCandidates, productFacts, DAY_MS } from "../src/lib/shop-insights";
import type { OrderDoc, ProductDoc } from "../src/types";

const NOW = 100 * DAY_MS;

const product = (id: string, over: Partial<ProductDoc> = {}): ProductDoc => ({
  id,
  shopId: "s",
  name: id,
  price: 10000,
  unit: "1 pc",
  category: "x",
  stock: 20,
  inStock: true,
  imageUrl: null,
  updatedAt: 0,
  ...over,
});

/** One order per day for the last 30 days, `qty` of each product in `ids`. */
function dailyOrders(lines: [string, number][], status: OrderDoc["status"] = "COMPLETED"): OrderDoc[] {
  return Array.from({ length: 30 }, (_, d) => ({
    id: `o${d}`,
    buyerId: "b",
    shopId: "s",
    shopName: "S",
    buyerName: "B",
    buyerPhone: "1",
    items: lines.map(([productId, qty]) => ({ productId, name: productId, unit: "1 pc", price: 10000, qty })),
    itemTotal: 0,
    status,
    timeline: [],
    deliveryAddress: { line1: "", landmark: "", lat: 0, lng: 0 },
    paymentMethod: "cod" as const,
    createdAt: NOW - (d + 1) * DAY_MS + 1, // oldest exactly inside the 30-day window
    updatedAt: 0,
  }));
}

describe("productFacts", () => {
  it("works out sales per day and days of stock left", () => {
    const [f] = productFacts([product("bulb", { stock: 4 })], dailyOrders([["bulb", 3]]), NOW);
    expect(f!.sold30d).toBe(90);
    expect(f!.perDay).toBeCloseTo(3);
    expect(f!.daysLeft).toBeCloseTo(4 / 3);
  });

  it("ignores rejected/cancelled orders", () => {
    const [f] = productFacts([product("bulb")], dailyOrders([["bulb", 3]], "REJECTED"), NOW);
    expect(f!.sold30d).toBe(0);
    expect(f!.daysLeft).toBeNull();
  });
});

describe("ideaCandidates", () => {
  const products = [
    product("bulb", { stock: 4 }), // 3/day -> restock
    product("cable", { stock: 40, price: 19900, mrp: 34900 }), // fast, under MRP -> price
    product("speaker", { stock: 6, price: 299900 }), // no sales -> slow
    product("tape", { stock: 2 }), // no sales but little stock -> nothing
    product("steady", { stock: 100 }), // sells, plenty of stock, no MRP -> nothing
  ];
  const facts = productFacts(products, dailyOrders([["bulb", 3], ["cable", 1], ["steady", 1]]), NOW);
  const cands = ideaCandidates(facts, 30);
  const kinds = Object.fromEntries(cands.map((c) => [c.facts.productId, c.kind]));

  it("picks restock, price and slow candidates only where the numbers say so (one per product)", () => {
    expect(kinds).toEqual({ bulb: "restock", cable: "price", speaker: "slow" });
  });

  it("suggests about two weeks of stock for a restock", () => {
    const bulb = cands.find((c) => c.facts.productId === "bulb")!;
    expect(bulb.defaultQty).toBe(42 - 4);
  });

  it("never allows a price above MRP or more than 10% up", () => {
    const cable = cands.find((c) => c.facts.productId === "cable")!;
    expect(cable.priceRange).toEqual([19900, 21900]); // +10% = ₹218.90 -> ₹219, under MRP ₹349
    expect(clampIdea(cable, { price: 99900 }).price).toBe(21900);
    expect(clampIdea(cable, { price: 19900 }).price).toBeUndefined(); // no change = no idea
  });

  it("doesn't call anything slow for a shop with under two weeks of orders", () => {
    expect(ideaCandidates(facts, 3).map((c) => c.kind)).not.toContain("slow");
    expect(ideaCandidates(productFacts(products, [], NOW), 0)).toEqual([]);
  });

  it("caps slow-item price cuts at 15%", () => {
    const speaker = cands.find((c) => c.facts.productId === "speaker")!;
    expect(clampIdea(speaker, { price: 100 }).price).toBe(254900);
  });

  it("keeps restock quantities in range and falls back to the default", () => {
    const bulb = cands.find((c) => c.facts.productId === "bulb")!;
    expect(clampIdea(bulb, { qty: 100000 }).qty).toBe(bulb.qtyRange![1]);
    expect(clampIdea(bulb, {}).qty).toBe(bulb.defaultQty);
  });
});

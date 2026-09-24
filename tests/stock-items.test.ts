import { describe, expect, it } from "vitest";
import { normalizeStockItems, normalizeUnit, type StockDraftItem } from "../src/lib/ai/stock-items";

const item = (over: Partial<StockDraftItem>): StockDraftItem => ({
  name: "Toor Dal",
  unit: "1 kg",
  category: "Dal & Pulses",
  price: 165,
  stock: 1,
  confidence: 0.9,
  ...over,
});

describe("normalizeUnit", () => {
  it("canonicalises common unit spellings", () => {
    expect(normalizeUnit("5 KG")).toBe("5 kg");
    expect(normalizeUnit("500gm")).toBe("500 g");
    expect(normalizeUnit("1 litre")).toBe("1 L");
    expect(normalizeUnit("200 ML")).toBe("200 ml");
    expect(normalizeUnit("6 pieces")).toBe("6 pcs");
    expect(normalizeUnit("kgs")).toBe("kg");
  });

  it("leaves units it doesn't know alone", () => {
    expect(normalizeUnit("1 bunch")).toBe("1 bunch");
    expect(normalizeUnit("4x100 g")).toBe("4x100 g");
    expect(normalizeUnit("  Pack  ")).toBe("Pack");
  });
});

describe("normalizeStockItems", () => {
  it("merges the same product seen twice (two facings on a shelf)", () => {
    const out = normalizeStockItems([
      item({ stock: 3, confidence: 0.9 }),
      item({ name: " toor dal ", unit: "1 KG", stock: 2, confidence: 0.5, mrp: 185 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Toor Dal", unit: "1 kg", stock: 5, confidence: 0.5, mrp: 185 });
  });

  it("keeps different sizes and brands apart", () => {
    const out = normalizeStockItems([
      item({ unit: "1 kg" }),
      item({ unit: "500 g" }),
      item({ brand: "Fortune" }),
    ]);
    expect(out).toHaveLength(3);
  });
});

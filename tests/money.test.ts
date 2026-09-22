import { describe, expect, it } from "vitest";
import { formatPaise, rupeesToPaise } from "../src/lib/money";

describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise(28)).toBe(2800);
  });

  it("converts fractional rupees without float drift", () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.5)).toBe(50);
  });

  it("rounds to the nearest paisa", () => {
    expect(rupeesToPaise(1.004)).toBe(100);
    expect(rupeesToPaise(1.006)).toBe(101);
    // Documents a real float quirk rather than asserting a "nice" number:
    // 1.005 * 100 is 100.49999999999999 in JS float, so Math.round takes it
    // down to 100, not up to 101 — rupeesToPaise doesn't hide this, callers
    // just shouldn't rely on exact halfway-paisa rupee inputs.
    expect(rupeesToPaise(1.005)).toBe(100);
  });

  it("handles zero", () => {
    expect(rupeesToPaise(0)).toBe(0);
  });
});

describe("formatPaise", () => {
  it("formats whole rupees with two decimals", () => {
    expect(formatPaise(2800)).toBe("₹28.00");
  });

  it("formats fractional paise", () => {
    expect(formatPaise(1999)).toBe("₹19.99");
  });

  it("adds thousands separators the en-IN way", () => {
    expect(formatPaise(12_34_567_00)).toBe("₹12,34,567.00");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });
});

describe("rupeesToPaise + formatPaise round-trip", () => {
  it("a cart total built from paise math matches what the form showed", () => {
    const price = rupeesToPaise(45.5); // one item
    const qty = 3;
    const total = price * qty;
    expect(formatPaise(total)).toBe("₹136.50");
  });
});

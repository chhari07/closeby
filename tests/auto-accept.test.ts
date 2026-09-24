import { describe, expect, it } from "vitest";
import {
  autoAcceptReadiness,
  autoAcceptResults,
  autoAcceptRulesSchema,
  evaluateAutoAccept,
  isWithinHours,
  ownAnswerStats,
} from "../src/lib/orders/auto-accept";
import type { AutoAcceptRules, OrderDoc, OrderTimelineEntry, ShopDoc } from "../src/types";

// Wed 2026-09-23 12:00 IST (06:30 UTC)
const NOON_IST = Date.UTC(2026, 8, 23, 6, 30);
const WED = 3;

const rules: AutoAcceptRules = { enabled: true, maxOrderValue: 1000_00, paymentMethods: ["cod", "online"] };
const shop = (over: Partial<ShopDoc> = {}) => ({
  status: "live" as const,
  isOpen: true,
  hours: { open: "09:00", close: "21:00", days: [0, 1, 2, 3, 4, 5, 6] },
  autoAccept: rules,
  ...over,
});
const order = (over: Partial<OrderDoc> = {}) => ({
  status: "PLACED" as const,
  paymentMethod: "cod" as const,
  paymentStatus: "none" as const,
  itemTotal: 500_00,
  stockReserved: true,
  riskFlags: [],
  ...over,
});

describe("evaluateAutoAccept", () => {
  it("accepts an order that meets every rule", () => {
    expect(evaluateAutoAccept(shop(), order(), NOON_IST)).toEqual({ accept: true });
  });

  it.each([
    ["rules off", shop({ autoAccept: { ...rules, enabled: false } }), order()],
    ["never set up", shop({ autoAccept: undefined }), order()],
    ["above the limit", shop(), order({ itemTotal: 1000_01 })],
    ["payment type not allowed", shop(), order({ paymentMethod: "pay_at_shop" })],
    ["online but unpaid", shop(), order({ paymentMethod: "online", paymentStatus: "pending" })],
    ["shop switched closed", shop({ isOpen: false }), order()],
    ["shop not live", shop({ status: "draft" }), order()],
    ["outside hours", shop({ hours: { open: "14:00", close: "21:00", days: [WED] } }), order()],
    ["closed today", shop({ hours: { open: "09:00", close: "21:00", days: [1] } }), order()],
    ["stock not reserved", shop(), order({ stockReserved: false })],
    ["has warnings", shop(), order({ riskFlags: [{ code: "far", level: "warn", text: "far" }] })],
    ["already answered", shop(), order({ status: "ACCEPTED" })],
  ])("waits for the owner when %s", (_, s, o) => {
    expect(evaluateAutoAccept(s, o, NOON_IST).accept).toBe(false);
  });

  it("accepts a paid online order", () => {
    expect(evaluateAutoAccept(shop(), order({ paymentMethod: "online", paymentStatus: "paid" }), NOON_IST).accept).toBe(true);
  });

  it("accepts exactly at the limit", () => {
    expect(evaluateAutoAccept(shop(), order({ itemTotal: 1000_00 }), NOON_IST).accept).toBe(true);
  });
});

describe("isWithinHours", () => {
  const at = (h: number, m = 0, dayOffset = 0) => Date.UTC(2026, 8, 23 + dayOffset, h, m) - 5.5 * 3_600_000; // IST wall clock
  it("normal day hours", () => {
    const hours = { open: "09:00", close: "21:00", days: [WED] };
    expect(isWithinHours(hours, at(8, 59))).toBe(false);
    expect(isWithinHours(hours, at(9, 0))).toBe(true);
    expect(isWithinHours(hours, at(20, 59))).toBe(true);
    expect(isWithinHours(hours, at(21, 0))).toBe(false);
  });
  it("hours past midnight belong to the day they opened", () => {
    const hours = { open: "18:00", close: "02:00", days: [WED] };
    expect(isWithinHours(hours, at(23, 0))).toBe(true); // Wed night
    expect(isWithinHours(hours, at(1, 0, 1))).toBe(true); // Thu 01:00, still Wed's shift
    expect(isWithinHours(hours, at(1, 0))).toBe(false); // Wed 01:00 = Tue's shift, Tue closed
    expect(isWithinHours(hours, at(3, 0, 1))).toBe(false);
  });
});

describe("autoAcceptRulesSchema", () => {
  it("rejects no payment types and silly limits", () => {
    expect(autoAcceptRulesSchema.safeParse({ ...rules, paymentMethods: [] }).success).toBe(false);
    expect(autoAcceptRulesSchema.safeParse({ ...rules, maxOrderValue: 0 }).success).toBe(false);
    expect(autoAcceptRulesSchema.safeParse({ ...rules, maxOrderValue: 60_000_00 }).success).toBe(false);
    expect(autoAcceptRulesSchema.safeParse({ ...rules, paymentMethods: ["bitcoin"] }).success).toBe(false);
  });
  it("drops duplicate payment types", () => {
    expect(autoAcceptRulesSchema.parse({ ...rules, paymentMethods: ["cod", "cod"] }).paymentMethods).toEqual(["cod"]);
  });
});

describe("autoAcceptReadiness", () => {
  it("unlocks on a high AI-advice accept rate", () => {
    expect(autoAcceptReadiness({ decided: 5, accepted: 4 }, { answered: 0, accepted: 0 }).ready).toBe(true);
    expect(autoAcceptReadiness({ decided: 4, accepted: 4 }, { answered: 0, accepted: 0 }).ready).toBe(false);
    expect(autoAcceptReadiness({ decided: 10, accepted: 7 }, { answered: 0, accepted: 0 }).ready).toBe(false);
  });
  it("unlocks when the owner accepts nearly every order", () => {
    expect(autoAcceptReadiness({ decided: 0, accepted: 0 }, { answered: 10, accepted: 9 }).ready).toBe(true);
    expect(autoAcceptReadiness({ decided: 0, accepted: 0 }, { answered: 10, accepted: 8 }).ready).toBe(false);
    expect(autoAcceptReadiness({ decided: 0, accepted: 0 }, { answered: 9, accepted: 9 }).ready).toBe(false);
  });
  it("says what's missing", () => {
    expect(autoAcceptReadiness({ decided: 1, accepted: 1 }, { answered: 3, accepted: 3 }).detail).toContain("now 3 of 3");
  });
});

const tl = (...entries: Partial<OrderTimelineEntry>[]) => ({
  timeline: [{ status: "PLACED", at: 0, by: "buyer" }, ...entries] as OrderTimelineEntry[],
});

describe("owner history and results", () => {
  it("counts only hand answers", () => {
    const orders = [
      tl({ status: "ACCEPTED", by: "shop" }),
      tl({ status: "REJECTED", by: "shop" }),
      tl({ status: "ACCEPTED", by: "shop", auto: true }),
      tl({ status: "CANCELLED", by: "buyer" }),
    ];
    expect(ownAnswerStats(orders)).toEqual({ answered: 2, accepted: 1 });
  });
  it("counts auto-accepted orders the shop later cancelled", () => {
    const orders = [
      { status: "COMPLETED" as const, ...tl({ status: "ACCEPTED", by: "shop", auto: true }) },
      { status: "CANCELLED" as const, ...tl({ status: "ACCEPTED", by: "shop", auto: true }, { status: "CANCELLED", by: "shop" }) },
      { status: "CANCELLED" as const, ...tl({ status: "ACCEPTED", by: "shop" }, { status: "CANCELLED", by: "shop" }) },
    ];
    expect(autoAcceptResults(orders)).toEqual({ accepted: 2, cancelledLater: 1 });
  });
});

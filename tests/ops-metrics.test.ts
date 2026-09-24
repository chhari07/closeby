import { describe, expect, it } from "vitest";
import { dailySeries, detectCostJump, formatUsd, istDay, istDayStart, orderRates, slowestShops } from "../src/lib/ops-metrics";
import type { OrderTimelineEntry } from "../src/types";

describe("detectCostJump", () => {
  const today = 20_000;
  const week = (usd: number) => new Map(Array.from({ length: 7 }, (_, i) => [today - 7 + i, usd]));

  it("flags a day at 2x+ the 7-day average", () => {
    const m = week(1);
    m.set(today, 2.5);
    expect(detectCostJump(m, today)).toMatchObject({ jumped: true, todayUsd: 2.5, baselineUsd: 1, ratio: 2.5 });
  });
  it("ignores a normal day", () => {
    const m = week(1);
    m.set(today, 1.5);
    expect(detectCostJump(m, today).jumped).toBe(false);
  });
  it("ignores tiny amounts", () => {
    const m = week(0.01);
    m.set(today, 0.3);
    expect(detectCostJump(m, today).jumped).toBe(false);
  });
  it("from nothing to real money is a jump; missing days count as $0", () => {
    const m = new Map([[today, 0.8]]);
    expect(detectCostJump(m, today)).toMatchObject({ jumped: true, baselineUsd: 0, ratio: null });
  });
});

describe("days", () => {
  it("IST day buckets", () => {
    // 2026-09-23 23:00 IST and 00:30 IST next day are different days
    const late = Date.UTC(2026, 8, 23, 17, 30);
    const early = Date.UTC(2026, 8, 23, 19, 0);
    expect(istDay(early)).toBe(istDay(late) + 1);
    expect(istDayStart(istDay(late))).toBe(Date.UTC(2026, 8, 22, 18, 30));
  });
  it("dailySeries fills gaps with 0 and ends today", () => {
    const s = dailySeries(new Map([[10, 2]]), 11, 3);
    expect(s).toEqual([
      { day: 9, usd: 0 },
      { day: 10, usd: 2 },
      { day: 11, usd: 0 },
    ]);
  });
});

describe("orderRates", () => {
  it("reject and cancel rates over orders that reached shops", () => {
    expect(orderRates({ COMPLETED: 6, REJECTED: 2, CANCELLED: 1, PLACED: 1 })).toMatchObject({
      reached: 10,
      rejectRate: 0.2,
      cancelRate: 0.1,
      completed: 6,
    });
    expect(orderRates({}).rejectRate).toBeNull();
  });
});

describe("slowestShops", () => {
  const o = (shopId: string, answerAfterMs: number, auto = false) => ({
    shopId,
    shopName: shopId.toUpperCase(),
    paymentMethod: "cod" as const,
    paidAt: undefined,
    timeline: [
      { status: "PLACED", at: 0, by: "buyer" },
      { status: "ACCEPTED", at: answerAfterMs, by: "shop", ...(auto ? { auto: true } : {}) },
    ] as OrderTimelineEntry[],
  });
  it("ranks shops by average hand-answer time, needs 3 orders, skips auto-accepted", () => {
    const orders = [
      ...[60_000, 120_000, 180_000].map((t) => o("a", t)),
      ...[600_000, 600_000, 600_000].map((t) => o("b", t)),
      ...[5, 5].map((t) => o("c", t)),
      ...[0, 0, 0, 0].map((t) => o("b", t, true)),
    ];
    expect(slowestShops(orders)).toEqual([
      { shopId: "b", shopName: "B", avgMs: 600_000, orders: 3 },
      { shopId: "a", shopName: "A", avgMs: 120_000, orders: 3 },
    ]);
  });
});

it("formatUsd", () => {
  expect(formatUsd(0)).toBe("$0");
  expect(formatUsd(0.01234)).toBe("$0.0123");
  expect(formatUsd(12.4)).toBe("$12.40");
});

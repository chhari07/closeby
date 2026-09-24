import { describe, expect, it } from "vitest";
import {
  catalogueSpeed,
  DAY_MS,
  formatDuration,
  responseStats,
  responseTimeMs,
  suggestionStats,
  type SuggestionRow,
} from "../src/lib/owner-stats";
import type { OrderDoc } from "../src/types";

const NOW = 1_000 * DAY_MS;

const order = (over: Partial<OrderDoc>): OrderDoc => ({
  id: "o",
  buyerId: "b",
  shopId: "s",
  shopName: "S",
  buyerName: "B",
  buyerPhone: "1",
  items: [],
  itemTotal: 0,
  status: "ACCEPTED",
  timeline: [],
  deliveryAddress: { line1: "", landmark: "", lat: 0, lng: 0 },
  paymentMethod: "cod",
  createdAt: NOW - DAY_MS,
  updatedAt: 0,
  ...over,
});

describe("AI suggestion accept rate", () => {
  const row = (type: SuggestionRow["type"], status: SuggestionRow["status"], edited = false, age = DAY_MS): SuggestionRow => ({
    type,
    status,
    edited,
    createdAt: NOW - age,
  });

  it("counts accepted out of decided, and 'without changes' separately", () => {
    const { overall, byType } = suggestionStats(
      [
        row("shopIdea", "approved"),
        row("shopIdea", "approved", true),
        row("shopIdea", "rejected"),
        row("shopIdea", "expired"),
        row("draftOrderAdvice", "approved"),
        row("draftCart", "approved"), // a buyer's helper — not the owner's
        row("draftStockList", "approved", false, 40 * DAY_MS), // outside 30 days
      ],
      NOW,
    );
    expect(overall).toEqual({ decided: 4, accepted: 3, acceptedAsIs: 2, ignored: 1, rate: 0.75 });
    expect(byType.map((t) => [t.label, t.stats.rate])).toEqual([
      ["Order advice", 1],
      ["Restock & price ideas", 2 / 3],
    ]);
  });

  it("has no rate before any decision", () => {
    expect(suggestionStats([], NOW).overall.rate).toBeNull();
  });
});

describe("order response time", () => {
  it("measures from placement to the shop's accept/reject", () => {
    const o = order({
      timeline: [
        { status: "PLACED", at: 1000, by: "buyer" },
        { status: "ACCEPTED", at: 1000 + 150_000, by: "shop" },
      ],
    });
    expect(responseTimeMs(o)).toBe(150_000);
  });

  it("for online orders, starts the clock when it's paid (that's when the shop sees it)", () => {
    const o = order({
      paymentMethod: "online",
      paidAt: 600_000,
      timeline: [
        { status: "PLACED", at: 0, by: "buyer" },
        { status: "ACCEPTED", at: 660_000, by: "shop" },
      ],
    });
    expect(responseTimeMs(o)).toBe(60_000);
  });

  it("ignores orders the shop never answered (e.g. the buyer cancelled first)", () => {
    const o = order({
      timeline: [
        { status: "PLACED", at: 0, by: "buyer" },
        { status: "CANCELLED", at: 10, by: "buyer" },
      ],
    });
    expect(responseTimeMs(o)).toBeNull();
  });

  it("compares this week with last week", () => {
    const answered = (daysAgo: number, ms: number) =>
      order({
        createdAt: NOW - daysAgo * DAY_MS,
        timeline: [
          { status: "PLACED", at: 0, by: "buyer" },
          { status: "ACCEPTED", at: ms, by: "shop" },
        ],
      });
    const s = responseStats([answered(1, 60_000), answered(2, 120_000), answered(9, 240_000)], NOW);
    expect(s).toEqual({ thisWeekMs: 90_000, thisWeekCount: 2, lastWeekMs: 240_000, lastWeekCount: 1 });
  });
});

describe("time to add the first 30 products", () => {
  const stamps = (n: number, gap: number) => Array.from({ length: n }, (_, i) => 1000 + i * gap);

  it("is the time from the 1st to the 30th product", () => {
    expect(catalogueSpeed(stamps(40, 5000), 40)).toEqual({ state: "done", ms: 29 * 5000, metTarget: true });
    expect(catalogueSpeed(stamps(30, 60_000), 30)).toMatchObject({ state: "done", metTarget: false });
  });

  it("shows progress below 30, and 'unknown' when older products have no timestamp", () => {
    expect(catalogueSpeed(stamps(12, 1000), 12)).toEqual({ state: "in_progress", added: 12 });
    expect(catalogueSpeed([...stamps(30, 1000), null], 31)).toEqual({ state: "unknown" });
  });
});

describe("formatDuration", () => {
  it("reads naturally", () => {
    expect(formatDuration(45_000)).toBe("45 s");
    expect(formatDuration(160_000)).toBe("2 min 40 s");
    expect(formatDuration(3_900_000)).toBe("1 h 5 min");
  });
});

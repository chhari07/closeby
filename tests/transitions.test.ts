import { describe, expect, it } from "vitest";
import { isValidTransition, isTerminal, TERMINAL_STATUSES } from "../src/lib/orders/transitions";
import type { OrderStatus } from "../src/types";

describe("isValidTransition", () => {
  it("allows the shop to accept a placed order", () => {
    expect(isValidTransition("PLACED", "ACCEPTED", "shop")).toEqual({
      ok: true,
      reasonRequired: false,
    });
  });

  it("allows the buyer to cancel a placed order", () => {
    expect(isValidTransition("PLACED", "CANCELLED", "buyer")).toEqual({
      ok: true,
      reasonRequired: false,
    });
  });

  it("requires a reason for a shop rejection", () => {
    const result = isValidTransition("PLACED", "REJECTED", "shop");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reasonRequired).toBe(true);
  });

  it("blocks the buyer from accepting their own order", () => {
    expect(isValidTransition("PLACED", "ACCEPTED", "buyer")).toEqual({ ok: false });
  });

  it("blocks skipping straight from PLACED to READY", () => {
    expect(isValidTransition("PLACED", "READY", "shop")).toEqual({ ok: false });
  });

  it("blocks any move out of a terminal status", () => {
    for (const from of TERMINAL_STATUSES) {
      expect(isValidTransition(from, "ACCEPTED", "shop")).toEqual({ ok: false });
      expect(isValidTransition(from, "PLACED", "buyer")).toEqual({ ok: false });
    }
  });

  it("blocks a no-op transition to the same status", () => {
    expect(isValidTransition("PLACED", "PLACED", "shop")).toEqual({ ok: false });
  });

  it("allows the full happy path in order", () => {
    const path: [OrderStatus, OrderStatus, "buyer" | "shop"][] = [
      ["PLACED", "ACCEPTED", "shop"],
      ["ACCEPTED", "PREPARING", "shop"],
      ["PREPARING", "READY", "shop"],
      ["READY", "COMPLETED", "shop"],
    ];
    for (const [from, to, by] of path) {
      expect(isValidTransition(from, to, by).ok).toBe(true);
    }
  });
});

describe("isTerminal", () => {
  it("is true for completed, rejected and cancelled", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
  });

  it("is false for every in-flight status", () => {
    expect(isTerminal("PLACED")).toBe(false);
    expect(isTerminal("ACCEPTED")).toBe(false);
    expect(isTerminal("PREPARING")).toBe(false);
    expect(isTerminal("READY")).toBe(false);
  });
});

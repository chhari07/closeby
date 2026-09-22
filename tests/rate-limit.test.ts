import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMITS, rateLimit, resetRateLimits } from "../src/lib/rate-limit";

const { limit, windowMs } = RATE_LIMITS.placeOrder;

beforeEach(() => resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", () => {
    for (let i = 0; i < limit; i++) {
      expect(rateLimit("placeOrder", "u1", 1000).ok).toBe(true);
    }
    const blocked = rateLimit("placeOrder", "u1", 1000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("allows again once the window has passed", () => {
    for (let i = 0; i < limit; i++) rateLimit("placeOrder", "u1", 1000);
    expect(rateLimit("placeOrder", "u1", 1000 + windowMs - 1).ok).toBe(false);
    expect(rateLimit("placeOrder", "u1", 1000 + windowMs).ok).toBe(true);
  });

  it("counts each user separately", () => {
    for (let i = 0; i < limit; i++) rateLimit("placeOrder", "u1", 1000);
    expect(rateLimit("placeOrder", "u1", 1000).ok).toBe(false);
    expect(rateLimit("placeOrder", "u2", 1000).ok).toBe(true);
  });

  it("counts each bucket separately", () => {
    for (let i = 0; i < limit; i++) rateLimit("placeOrder", "u1", 1000);
    expect(rateLimit("transitionOrder", "u1", 1000).ok).toBe(true);
  });

  it("blocked calls do not extend the block", () => {
    for (let i = 0; i < limit; i++) rateLimit("placeOrder", "u1", 1000);
    for (let i = 0; i < 50; i++) rateLimit("placeOrder", "u1", 2000);
    expect(rateLimit("placeOrder", "u1", 1000 + windowMs).ok).toBe(true);
  });
});

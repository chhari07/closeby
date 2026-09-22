/**
 * Sliding-window rate limiter, keyed by (bucket, user id).
 *
 * State is in memory, so it is per server instance: fine for `next dev` and a
 * single `next start` process. On serverless or multiple instances each
 * instance counts separately — swap `hits` for Redis/Upstash (same
 * `rateLimit` signature) before relying on it in production.
 */

export interface RateLimitRule {
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** One rule per kind of action. Add AI helpers here later (Step 2). */
export const RATE_LIMITS = {
  placeOrder: { limit: 10, windowMs: 60_000 },
  transitionOrder: { limit: 60, windowMs: 60_000 },
  productWrite: { limit: 60, windowMs: 60_000 },
  productImport: { limit: 5, windowMs: 60_000 },
  firebaseToken: { limit: 20, windowMs: 60_000 },
  // Sign-in/sign-up related: Clerk rate-limits its own OTP endpoints, but the
  // server actions that run right after (writing our own users/shops docs)
  // don't get that protection for free, so they get their own bucket.
  completeOnboarding: { limit: 8, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

const hits = new Map<string, number[]>();
const CLEANUP_EVERY = 500;
let calls = 0;

function cleanup(now: number) {
  for (const [key, times] of hits) {
    const newest = times[times.length - 1];
    if (newest === undefined || now - newest > 10 * 60_000) hits.delete(key);
  }
}

export function rateLimit(
  bucket: RateLimitBucket,
  userId: string,
  now: number = Date.now(),
): RateLimitResult {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const key = `${bucket}:${userId}`;

  if (++calls % CLEANUP_EVERY === 0) cleanup(now);

  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

/** Human-readable message for action results / thrown errors. */
export function rateLimitMessage(retryAfterSec: number): string {
  return `Too many requests. Please try again in ${retryAfterSec}s.`;
}

/** Test helper. */
export function resetRateLimits() {
  hits.clear();
  calls = 0;
}

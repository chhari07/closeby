import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({}) }));

const { isAway, renderAlert, AWAY_AFTER_MS } = await import("../src/lib/email/alerts");

describe("email alerts", () => {
  it("treats someone as away only after the heartbeat goes stale", () => {
    const now = 10_000_000;
    expect(isAway(now - 30_000, now)).toBe(false); // on the site
    expect(isAway(now - AWAY_AFTER_MS - 1, now)).toBe(true); // tab closed / no heartbeat
    expect(isAway(0, now)).toBe(true); // closed their last tab (beacon) or never visited
  });

  it("escapes anything people typed before it goes into the email", () => {
    const { html, text } = renderAlert({
      name: "<b>Aman</b>",
      heading: "New message from Tom & Jerry",
      lines: ['“<script>alert("x")</script>”'],
      button: { label: "Reply", url: "http://localhost:3000/messages/abc" },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Tom &amp; Jerry");
    expect(html).not.toContain("<b>Aman</b>");
    expect(text).toContain("Reply: http://localhost:3000/messages/abc");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { geohashForLocation } from "geofire-common";

// nearby-shops.ts (and the db modules it imports) start with
// `import "server-only"`, which throws unconditionally outside of Next's
// server bundling — stub it out so this file can be unit-tested in plain
// Node under vitest.
vi.mock("server-only", () => ({}));

interface FakeShop {
  id: string;
  data: Record<string, unknown>;
}

let dataset: FakeShop[] = [];

// The SQL only pre-narrows (live shops inside a lat/lng box); this test is
// about *our* in-memory filtering and ranking, so the fake database simply
// returns every row and the code under test must still get it right.
vi.mock("@/lib/db/client", () => ({
  db: () => async () => dataset.map((r) => ({ id: r.id, ...r.data })),
}));

const ORIGIN = { lat: 24.645, lng: 77.317 }; // Guna, MP

function fakeShop(id: string, offsetLat: number, offsetLng: number, overrides: Partial<Record<string, unknown>> = {}): FakeShop {
  const lat = ORIGIN.lat + offsetLat;
  const lng = ORIGIN.lng + offsetLng;
  return {
    id,
    data: {
      ownerId: `owner-${id}`,
      status: "live",
      onboardingStep: 4,
      isOpen: true,
      type: "kirana",
      name: `Shop ${id}`,
      phone: "9999999999",
      hours: undefined,
      location: { lat, lng, geohash: geohashForLocation([lat, lng]), address: "", localityId: "" },
      itemCount: 5,
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
    },
  };
}

// ~0.001 degrees of latitude is roughly 111 m — small, controlled offsets
// keep every fixture shop close to ORIGIN but at a known relative distance.
describe("getNearbyShops", () => {
  beforeEach(() => {
    dataset = [];
    vi.resetModules();
  });

  it("returns only shops within the radius, nearest first", async () => {
    const { getNearbyShops } = await import("../src/lib/geo/nearby-shops");
    dataset = [
      fakeShop("near", 0.001, 0), // ~111 m away
      fakeShop("mid", 0.01, 0), // ~1.1 km away
      fakeShop("far", 0.2, 0), // ~22 km away — outside a 3 km radius
    ];

    const results = await getNearbyShops(ORIGIN, 3000);

    expect(results.map((r) => r.shop.id)).toEqual(["near", "mid"]);
    expect(results[0]!.distanceInM).toBeLessThan(results[1]!.distanceInM);
  });

  it("excludes shops that are not live or not open", async () => {
    const { getNearbyShops } = await import("../src/lib/geo/nearby-shops");
    dataset = [
      fakeShop("draft", 0.001, 0, { status: "draft" }),
      fakeShop("closed", 0.001, 0, { isOpen: false }),
      fakeShop("live-open", 0.001, 0),
    ];

    const results = await getNearbyShops(ORIGIN, 3000);

    expect(results.map((r) => r.shop.id)).toEqual(["live-open"]);
  });

  it("ignores a shop with no location set", async () => {
    const { getNearbyShops } = await import("../src/lib/geo/nearby-shops");
    dataset = [fakeShop("no-loc", 0.001, 0, { location: undefined })];

    const results = await getNearbyShops(ORIGIN, 3000);

    expect(results).toEqual([]);
  });

  it("Step 1.4: returns every shop in range, not a truncated page", async () => {
    const { getNearbyShops } = await import("../src/lib/geo/nearby-shops");
    // More than the old Firestore per-bound page size (300), all genuinely
    // within the search radius.
    const COUNT = 340;
    dataset = Array.from({ length: COUNT }, (_, i) =>
      fakeShop(`shop-${i}`, 0.0001 * (i % 50), 0.0001 * Math.floor(i / 50)),
    );

    const results = await getNearbyShops(ORIGIN, 5000);

    expect(results).toHaveLength(COUNT);
  });

  it("radius 0 (ANY_DISTANCE) returns every live+open shop ranked by distance", async () => {
    const { getNearbyShops } = await import("../src/lib/geo/nearby-shops");
    dataset = [
      fakeShop("a", 0.01, 0),
      fakeShop("b", 0.001, 0),
      fakeShop("c", 0.05, 0),
    ];

    const results = await getNearbyShops(ORIGIN, 0);

    expect(results.map((r) => r.shop.id)).toEqual(["b", "a", "c"]);
  });

  it("returns nothing for an invalid origin", async () => {
    const { getNearbyShops } = await import("../src/lib/geo/nearby-shops");
    dataset = [fakeShop("x", 0.001, 0)];

    expect(await getNearbyShops({ lat: NaN, lng: 0 }, 1000)).toEqual([]);
    expect(await getNearbyShops(ORIGIN, -1)).toEqual([]);
  });
});

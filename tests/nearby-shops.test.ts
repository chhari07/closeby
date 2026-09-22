import { beforeEach, describe, expect, it, vi } from "vitest";
import { geohashForLocation } from "geofire-common";

// nearby-shops.ts (and the admin module it imports) start with
// `import "server-only"`, which throws unconditionally outside of Next's
// server bundling — stub it out so this file can be unit-tested in plain
// Node under vitest.
vi.mock("server-only", () => ({}));

// Real distance math, but a single geohash bound covering the whole
// keyspace — this test is about *our* filtering/paging logic (Step 1.4),
// not about re-deriving geofire-common's own bound math.
vi.mock("geofire-common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("geofire-common")>();
  return { ...actual, geohashQueryBounds: () => [["0", "zzzzzzzzzzzz"]] };
});

interface FakeShop {
  id: string;
  data: Record<string, unknown>;
}

let dataset: FakeShop[] = [];

// Real Firestore excludes documents missing the orderBy field entirely
// (rather than sorting them as "least"), so a doc with no location — or no
// geohash on it — never comes back from an orderBy("location.geohash")
// query. null here, not a thrown error, lets callers filter it out.
function geohashOf(data: Record<string, unknown>): string | null {
  const loc = data.location as { geohash?: string } | undefined;
  return loc?.geohash ?? null;
}

function makeQuery(state: {
  whereField?: string;
  whereValue?: unknown;
  ordered?: boolean;
  startAt?: string;
  endAt?: string;
  afterGeohash?: string;
  limitN?: number;
}) {
  return {
    where(field: string, _op: string, value: unknown) {
      void _op;
      return makeQuery({ ...state, whereField: field, whereValue: value });
    },
    orderBy(_field: string) {
      void _field;
      return makeQuery({ ...state, ordered: true });
    },
    startAt(v: string) {
      return makeQuery({ ...state, startAt: v });
    },
    endAt(v: string) {
      return makeQuery({ ...state, endAt: v });
    },
    startAfter(cursor: { data: () => Record<string, unknown> }) {
      return makeQuery({ ...state, afterGeohash: geohashOf(cursor.data()) ?? undefined });
    },
    limit(n: number) {
      return makeQuery({ ...state, limitN: n });
    },
    async get() {
      let rows = dataset;
      if (state.whereField) {
        rows = rows.filter((r) => r.data[state.whereField!] === state.whereValue);
      }
      if (state.ordered) {
        rows = rows.filter((r) => geohashOf(r.data) !== null);
        rows = [...rows].sort((a, b) => (geohashOf(a.data)! < geohashOf(b.data)! ? -1 : 1));
        if (state.startAt !== undefined) rows = rows.filter((r) => geohashOf(r.data)! >= state.startAt!);
        if (state.endAt !== undefined) rows = rows.filter((r) => geohashOf(r.data)! <= state.endAt!);
        if (state.afterGeohash !== undefined) rows = rows.filter((r) => geohashOf(r.data)! > state.afterGeohash!);
      }
      if (state.limitN !== undefined) rows = rows.slice(0, state.limitN);
      const docs = rows.map((r) => ({ id: r.id, data: () => r.data }));
      return { docs, size: docs.length };
    },
  };
}

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: (name: string) => {
      if (name !== "shops") throw new Error(`unexpected collection ${name}`);
      return makeQuery({});
    },
  }),
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

  it("Step 1.4: pages through a bound with more than the per-page cap instead of truncating", async () => {
    const { getNearbyShops } = await import("../src/lib/geo/nearby-shops");
    // MAX_DOCS_PER_BOUND is 300 — put more than that in a single (mocked,
    // whole-keyspace) bound, all genuinely within the search radius.
    const COUNT = 340;
    dataset = Array.from({ length: COUNT }, (_, i) =>
      fakeShop(`shop-${i}`, 0.0001 * (i % 50), 0.0001 * Math.floor(i / 50)),
    );

    const results = await getNearbyShops(ORIGIN, 5000);

    expect(results).toHaveLength(COUNT);
  });

  it("radius 0 (ANY_DISTANCE) returns every live+open shop ranked by distance, uncapped by bound size", async () => {
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

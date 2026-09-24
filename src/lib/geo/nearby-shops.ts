import "server-only";
import { distanceBetween } from "geofire-common";
import { db } from "@/lib/db/client";
import { toShop } from "@/lib/db/rows";
import type { GeoPoint, NearbyShopResult, ShopDoc, ShopListResult } from "@/types";

/** Cap for one proximity query — far more shops than a hyperlocal search should ever see. */
const MAX_SHOPS = 2000;
/** Cap for the no-radius-limit query (all live shops, nearest first). */
const MAX_UNLIMITED_DOCS = 1000;

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Live shops whose location falls inside the lat/lng box around `center`
 * that contains the whole search circle; the exact circle check happens in
 * memory afterwards. (Replaces the Firestore geohash-bound queries, which
 * needed paging per bound — Step 1.4 — because Firestore couldn't do this
 * in one query.)
 */
async function liveShopsInBox(center: GeoPoint, radiusInM: number): Promise<ShopDoc[]> {
  const dLat = radiusInM / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  const dLng = radiusInM / (METERS_PER_DEGREE_LAT * cosLat);
  const rows = await db()`
    select * from shops
    where status = 'live'
      and location is not null
      and (location->>'lat')::float8 between ${center.lat - dLat} and ${center.lat + dLat}
      and (location->>'lng')::float8 between ${center.lng - dLng} and ${center.lng + dLng}
    limit ${MAX_SHOPS}
  `;
  return rows.map(toShop);
}

async function allLiveShops(): Promise<ShopDoc[]> {
  const rows = await db()`select * from shops where status = 'live' limit ${MAX_UNLIMITED_DOCS}`;
  return rows.map(toShop);
}

function hasValidLocation(shop: ShopDoc): boolean {
  const loc = shop.location;
  return (
    !!loc &&
    typeof loc.lat === "number" &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng)
  );
}

/**
 * The single source of truth for proximity search — call this from
 * everywhere that needs nearby shops (buyer list, search). Do not
 * duplicate the geohash-bound-query + client-side-filter pattern elsewhere.
 *
 * The database narrows to live shops inside the search box; open/closed,
 * a valid location and the exact distance are checked in memory.
 */
export async function getNearbyShops(
  origin: GeoPoint,
  radiusInM: number
): Promise<NearbyShopResult[]> {
  if (
    !origin ||
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    !Number.isFinite(radiusInM) ||
    radiusInM < 0
  ) {
    return [];
  }

  const center: [number, number] = [origin.lat, origin.lng];
  // radiusInM === 0 (ANY_DISTANCE): no limit — read every live shop, then
  // rank purely by distance.
  const unlimited = radiusInM === 0;

  const shops = unlimited ? await allLiveShops() : await liveShopsInBox(origin, radiusInM);

  const results: NearbyShopResult[] = [];
  for (const shop of shops) {
    if (shop.status !== "live" || shop.isOpen !== true) continue;
    if (!hasValidLocation(shop)) continue;

    const distanceInM =
      distanceBetween(center, [shop.location!.lat, shop.location!.lng]) * 1000;

    if (unlimited || distanceInM <= radiusInM) {
      results.push({ shop, distanceInM });
    }
  }

  results.sort((a, b) => a.distanceInM - b.distanceInM);
  return results;
}

/**
 * The "Any distance" browse list: EVERY live shop — open or closed, with or
 * without a location on file — whether or not the buyer has set a location
 * (phone, PC, anywhere). Open shops come first, then nearest (when a
 * distance can be worked out); shops with no distance go last. Ordering
 * flows (AI cart, product search) keep using getNearbyShops, which only
 * returns open shops.
 */
export async function listAllShops(origin: GeoPoint | null): Promise<ShopListResult[]> {
  const shops = await allLiveShops();

  const hasOrigin = !!origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng);
  const results: ShopListResult[] = shops.map((shop) => {
    const distanceInM =
      hasOrigin && hasValidLocation(shop)
        ? distanceBetween([origin!.lat, origin!.lng], [shop.location!.lat, shop.location!.lng]) * 1000
        : null;
    return { shop, distanceInM };
  });

  results.sort((a, b) => {
    if (a.shop.isOpen !== b.shop.isOpen) return a.shop.isOpen ? -1 : 1;
    if (a.distanceInM === null || b.distanceInM === null) {
      if (a.distanceInM === b.distanceInM) return a.shop.name.localeCompare(b.shop.name);
      return a.distanceInM === null ? 1 : -1;
    }
    return a.distanceInM - b.distanceInM;
  });
  return results;
}

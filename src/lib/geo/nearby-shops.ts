import "server-only";
import { geohashQueryBounds, distanceBetween } from "geofire-common";
import { adminDb } from "@/lib/firebase/admin";
import type { GeoPoint, NearbyShopResult, ShopDoc } from "@/types";

/** Page size per geohash-bound query. */
const MAX_DOCS_PER_BOUND = 300;
/** Safety cap on how many pages we'll page through a single bound —
 *  MAX_PAGES_PER_BOUND * MAX_DOCS_PER_BOUND shops in one geohash cell is
 *  far more than a hyperlocal search should ever see; this just stops a
 *  single bound from paging forever if something is very wrong. */
const MAX_PAGES_PER_BOUND = 5;
/** Cap for the no-radius-limit query (all live shops, nearest first). */
const MAX_UNLIMITED_DOCS = 1000;

function shopFromDoc(id: string, data: FirebaseFirestore.DocumentData): ShopDoc {
  return {
    id,
    ownerId: data.ownerId,
    status: data.status,
    onboardingStep: data.onboardingStep,
    isOpen: data.isOpen,
    type: data.type,
    name: data.name,
    phone: data.phone,
    hours: data.hours,
    location: data.location,
    itemCount: data.itemCount ?? 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Step 1.4: a geohash bound with more than MAX_DOCS_PER_BOUND shops in it
 * used to silently drop everything past the cap — a busy area could hide
 * real, live shops from search with no sign anything was cut. This pages
 * through the bound with `startAfter` until it's exhausted (a page comes
 * back smaller than the page size) or the safety cap is hit.
 */
async function queryBoundExhaustive(
  start: string,
  end: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  for (let page = 0; page < MAX_PAGES_PER_BOUND; page++) {
    let q = adminDb()
      .collection("shops")
      .orderBy("location.geohash")
      .startAt(start)
      .endAt(end)
      .limit(MAX_DOCS_PER_BOUND);
    if (cursor) {
      q = adminDb()
        .collection("shops")
        .orderBy("location.geohash")
        .startAfter(cursor)
        .endAt(end)
        .limit(MAX_DOCS_PER_BOUND);
    }
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.size < MAX_DOCS_PER_BOUND) break; // bound is exhausted
    cursor = snap.docs[snap.docs.length - 1];
  }
  return docs;
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
 * Only `location.geohash` is filtered in Firestore; status/isOpen are applied
 * in memory. A bounding box returns tens of docs, so the extra reads are
 * cheap, and this needs no composite index — new filters won't require one.
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
  // radiusInM === 0 (ANY_DISTANCE): no limit — read every live shop instead of
  // geohash bounds, then rank purely by distance.
  const unlimited = radiusInM === 0;

  const docBatches = unlimited
    ? [
        (
          await adminDb()
            .collection("shops")
            .where("status", "==", "live")
            .limit(MAX_UNLIMITED_DOCS)
            .get()
        ).docs,
      ]
    : await Promise.all(
        geohashQueryBounds(center, radiusInM).map(([start, end]) =>
          queryBoundExhaustive(start, end)
        )
      );

  const seen = new Map<string, ShopDoc>();
  for (const docs of docBatches) {
    for (const doc of docs) {
      if (seen.has(doc.id)) continue;
      seen.set(doc.id, shopFromDoc(doc.id, doc.data()));
    }
  }

  const results: NearbyShopResult[] = [];
  for (const shop of seen.values()) {
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
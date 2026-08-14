import "server-only";
import { geohashQueryBounds, distanceBetween } from "geofire-common";
import { adminDb } from "@/lib/firebase/admin";
import type { GeoPoint, NearbyShopResult, ShopDoc } from "@/types";

/** Safety cap per geohash bound so a runaway bound can't blow up a request. */
const MAX_DOCS_PER_BOUND = 300;

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
    radiusInM <= 0
  ) {
    return [];
  }

  const center: [number, number] = [origin.lat, origin.lng];
  const bounds = geohashQueryBounds(center, radiusInM);

  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      adminDb()
        .collection("shops")
        .orderBy("location.geohash")
        .startAt(start)
        .endAt(end)
        .limit(MAX_DOCS_PER_BOUND)
        .get()
    )
  );

  const seen = new Map<string, ShopDoc>();
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
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

    if (distanceInM <= radiusInM) {
      results.push({ shop, distanceInM });
    }
  }

  results.sort((a, b) => a.distanceInM - b.distanceInM);
  return results;
}
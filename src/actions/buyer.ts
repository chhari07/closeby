"use server";

import { auth } from "@clerk/nextjs/server";
import { adminDb } from "@/lib/firebase/admin";
import { getNearbyShops } from "@/lib/geo/nearby-shops";
import { toGeohash } from "@/lib/geo/geohash";
import type { GeoPoint, Locality, NearbyShopResult } from "@/types";
import type { ActionResult } from "./types";

export async function listLocalities(): Promise<Locality[]> {
  const snap = await adminDb().collection("localities").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Locality, "id">) }));
}

export async function findNearbyShops(
  origin: GeoPoint,
  radiusInM: number
): Promise<NearbyShopResult[]> {
  return getNearbyShops(origin, radiusInM);
}

export async function saveMyLocation(
  point: GeoPoint,
  source: "gps" | "manual",
  localityId?: string
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  await adminDb()
    .collection("users")
    .doc(userId)
    .set(
      {
        lastKnownLocation: {
          lat: point.lat,
          lng: point.lng,
          geohash: toGeohash(point),
          localityId: localityId ?? null,
          source,
        },
      },
      { merge: true }
    );
  return { ok: true };
}

export async function getMyLastLocation(): Promise<{
  lat: number;
  lng: number;
  localityId?: string;
  source: "gps" | "manual";
} | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const doc = await adminDb().collection("users").doc(userId).get();
  const loc = doc.data()?.lastKnownLocation;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng, localityId: loc.localityId, source: loc.source };
}

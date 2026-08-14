import { geohashForLocation, distanceBetween } from "geofire-common";
import type { GeoPoint, Locality } from "@/types";

export function toGeohash(point: GeoPoint): string {
  return geohashForLocation([point.lat, point.lng]);
}

export function metersBetween(a: GeoPoint, b: GeoPoint): number {
  return distanceBetween([a.lat, a.lng], [b.lat, b.lng]) * 1000;
}

export function nearestLocality(point: GeoPoint, localities: Locality[]): Locality | null {
  if (localities.length === 0) return null;
  let best = localities[0]!;
  let bestDist = metersBetween(point, best.center);
  for (const loc of localities.slice(1)) {
    const d = metersBetween(point, loc.center);
    if (d < bestDist) {
      best = loc;
      bestDist = d;
    }
  }
  return best;
}

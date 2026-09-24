"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { findUser, listLocalityRows } from "@/lib/db/rows";
import { getNearbyShops, listAllShops } from "@/lib/geo/nearby-shops";
import { ANY_DISTANCE } from "@/lib/geo/radius";
import { toGeohash } from "@/lib/geo/geohash";
import type { GeoPoint, Locality, NearbyShopResult, ShopListResult } from "@/types";
import type { ActionResult } from "./types";
import { getShopCatalog } from "@/lib/catalog";
import { matchingTerm, normalizeQuery, queryWords, sanitizeTerms } from "@/lib/search-terms";

export async function listLocalities(): Promise<Locality[]> {
  return listLocalityRows();
}

/** "Any distance" lists every live shop (location optional); a km radius
 *  needs the buyer's location and lists only open shops inside it. */
export async function findNearbyShops(
  origin: GeoPoint | null,
  radiusInM: number
): Promise<ShopListResult[]> {
  if (radiusInM === ANY_DISTANCE) return listAllShops(origin);
  if (!origin) return [];
  return getNearbyShops(origin, radiusInM);
}

export interface ProductMatchResult extends NearbyShopResult {
  matchedProductName: string;
}

/** Bounds how many of the nearest shops' product collections a single
 *  search reads — keeps a search-box query cheap and bounded rather than
 *  scanning every nearby shop's whole catalog. */
const MAX_SHOPS_TO_SCAN = 15;
const MAX_PRODUCTS_PER_SHOP = 150;

/** Nearby shops with an in-stock product matching any of `terms` (name or alias). */
async function shopsWithProducts(origin: GeoPoint, radiusInM: number, terms: string[]): Promise<ProductMatchResult[]> {
  if (terms.length === 0) return [];
  const nearby = (await getNearbyShops(origin, radiusInM)).slice(0, MAX_SHOPS_TO_SCAN);
  const matches = await Promise.all(
    nearby.map(async (result) => {
      // Cached catalog (src/lib/catalog.ts): a search costs no database reads once warm.
      const inStock = (await getShopCatalog(result.shop.id)).filter((p) => p.inStock).slice(0, MAX_PRODUCTS_PER_SHOP);
      const hit = inStock.find((p) => matchingTerm(p, terms) !== null);
      return hit ? { ...result, matchedProductName: hit.name } : null;
    }),
  );
  return matches.filter((m): m is ProductMatchResult => m !== null);
}

/**
 * Step 4.1 (Hindi/Hinglish/English product search), the free part: a
 * case-insensitive match against each product's name and its aliases
 * (Step 1.10 — "chawal", "doodh", etc.) — first the whole query, then its
 * meaningful words if it's short ("dal chawal" finds shops with dal or rice). When this
 * finds nothing the search box asks the AI (searchQuery helper) what the
 * buyer meant, and calls searchNearbyShopsByTerms with its answer.
 *
 * Bounded to the MAX_SHOPS_TO_SCAN nearest shops — fine for a hyperlocal
 * catalog's current size, not a substitute for a real search index
 * (Step 5.3) if the shop count grows much larger.
 */
export async function searchNearbyShopsByProduct(
  origin: GeoPoint,
  radiusInM: number,
  query: string
): Promise<ProductMatchResult[]> {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];
  const whole = await shopsWithProducts(origin, radiusInM, [q]);
  if (whole.length > 0) return whole;
  // Short queries ("dal chawal", "remote cell") are just product words; a
  // sentence ("phone charge karne ka wire") would match on its filler
  // words, so that's left to the AI step instead.
  const words = queryWords(q);
  if (words.length === 0 || words.length > 2 || (words.length === 1 && words[0] === q)) return [];
  return shopsWithProducts(origin, radiusInM, words);
}

/** Search with product terms the AI worked out from the buyer's text (re-cleaned here). */
export async function searchNearbyShopsByTerms(
  origin: GeoPoint,
  radiusInM: number,
  terms: string[],
): Promise<ProductMatchResult[]> {
  return shopsWithProducts(origin, radiusInM, sanitizeTerms(terms));
}

export async function saveMyLocation(
  point: GeoPoint,
  source: "gps" | "manual",
  localityId?: string
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const lastKnownLocation = {
    lat: point.lat,
    lng: point.lng,
    geohash: toGeohash(point),
    localityId: localityId ?? null,
    source,
  };
  const now = Date.now();
  await db()`
    insert into users (id, last_known_location, created_at, updated_at)
    values (${userId}, ${db().json(lastKnownLocation)}, ${now}, ${now})
    on conflict (id) do update set last_known_location = excluded.last_known_location
  `;
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
  const loc = (await findUser(userId))?.lastKnownLocation;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng, localityId: loc.localityId, source: loc.source };
}

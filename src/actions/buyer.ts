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

/**
 * Step 4.1 (Hindi/Hinglish/English product search), the non-AI base
 * version: a plain, case-insensitive substring match against each
 * product's name and its aliases (Step 1.10 — "chawal", "doodh", etc.).
 * No model call here on purpose — this runs from a live search box, and
 * an AI call per query would be slower and cost real money for something
 * a direct alias match already covers well for a catalog this size.
 * Layering Haiku-based query normalisation on top (the roadmap's fuller
 * version) is a real next step, not this one — it needs its own
 * debounce/cost design so it doesn't fire on every keystroke.
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
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const nearby = (await getNearbyShops(origin, radiusInM)).slice(0, MAX_SHOPS_TO_SCAN);

  const matches = await Promise.all(
    nearby.map(async (result) => {
      // Cached catalog (src/lib/catalog.ts): a search costs no database reads once warm.
      const inStock = (await getShopCatalog(result.shop.id)).filter((p) => p.inStock).slice(0, MAX_PRODUCTS_PER_SHOP);

      const hit = inStock.find((p) => {
        const nameHit = typeof p.name === "string" && p.name.toLowerCase().includes(q);
        const aliasHit =
          Array.isArray(p.aliases) &&
          p.aliases.some((a: unknown) => typeof a === "string" && a.toLowerCase().includes(q));
        return nameHit || aliasHit;
      });
      if (!hit) return null;
      return { ...result, matchedProductName: hit.name };
    })
  );

  return matches.filter((m): m is ProductMatchResult => m !== null);
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

"use server";

import { db } from "@/lib/db/client";
import { listLocalityRows, toShop } from "@/lib/db/rows";
import { requireUserId, requireShopOwner } from "@/lib/auth/guards";
import { toGeohash, nearestLocality } from "@/lib/geo/geohash";
import {
  shopTypeStepSchema,
  shopDetailsStepSchema,
  shopSeedSchema,
  shopHoursSchema,
  shopLocationStepSchema,
} from "@/lib/validation/shop";
import type { ShopDoc } from "@/types";
import type { z } from "zod";
import type { ActionResult } from "./types";
import { cache } from "react";

/** Dashboard layout + page both ask for the shop: one database read per request (see getMe). */
export async function getMyShop(): Promise<ShopDoc | null> {
  return getMyShopOncePerRequest();
}

const getMyShopOncePerRequest = cache(async (): Promise<ShopDoc | null> => {
  const userId = await requireUserId();
  const [row] = await db()`select * from shops where owner_id = ${userId} limit 1`;
  return row ? toShop(row) : null;
});

async function ensureDraftShop(userId: string): Promise<string> {
  // owner_id is unique, so two concurrent calls can't both create a draft.
  const now = Date.now();
  await db()`
    insert into shops (owner_id, created_at, updated_at)
    values (${userId}, ${now}, ${now})
    on conflict (owner_id) do nothing
  `;
  const [row] = await db()`select id from shops where owner_id = ${userId}`;
  return row!.id as string;
}

/**
 * Called right after sign-up so the shop name and phone typed into the
 * sign-up form seed the draft shop — the onboarding wizard's Details step
 * then arrives pre-filled instead of asking for them again.
 */
export async function createShopDraft(input: { name: string; phone: string }): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = shopSeedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const shopId = await ensureDraftShop(userId);
  await db()`
    update shops set name = ${parsed.data.name}, phone = ${parsed.data.phone}, updated_at = ${Date.now()}
    where id = ${shopId}
  `;
  return { ok: true };
}

export async function saveShopType(input: z.infer<typeof shopTypeStepSchema>): Promise<ActionResult<{ shopId: string }>> {
  const userId = await requireUserId();
  const parsed = shopTypeStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const shopId = await ensureDraftShop(userId);
  await db()`
    update shops set type = ${parsed.data.type}, onboarding_step = greatest(onboarding_step, 2), updated_at = ${Date.now()}
    where id = ${shopId}
  `;
  return { ok: true, data: { shopId } };
}

export async function saveShopDetails(
  shopId: string,
  input: z.infer<typeof shopDetailsStepSchema>
): Promise<ActionResult> {
  await requireShopOwner(shopId);
  const parsed = shopDetailsStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const hours = { open: parsed.data.open, close: parsed.data.close, days: parsed.data.days };
  await db()`
    update shops set
      name = ${parsed.data.name},
      phone = ${parsed.data.phone},
      hours = ${db().json(hours)},
      onboarding_step = greatest(onboarding_step, 3),
      updated_at = ${Date.now()}
    where id = ${shopId}
  `;
  return { ok: true };
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { "User-Agent": "CloseBy/1.0 (hyperlocal shop discovery, Guna)" } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.display_name === "string" ? json.display_name : null;
  } catch {
    return null;
  }
}

export async function saveShopLocation(
  shopId: string,
  input: z.infer<typeof shopLocationStepSchema>
): Promise<ActionResult> {
  await requireShopOwner(shopId);
  const parsed = shopLocationStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const { lat, lng } = parsed.data;
  let address = parsed.data.address;
  if (!address) {
    address = (await reverseGeocode(lat, lng)) ?? "";
  }
  if (!address) {
    return {
      ok: false,
      error: "Could not determine an address for this location. Please try adjusting the pin.",
    };
  }

  const nearest = nearestLocality({ lat, lng }, await listLocalityRows());
  const location = {
    lat,
    lng,
    geohash: toGeohash({ lat, lng }),
    address,
    localityId: nearest?.id ?? "",
  };
  await db()`
    update shops set
      location = ${db().json(location)},
      onboarding_step = greatest(onboarding_step, 4),
      updated_at = ${Date.now()}
    where id = ${shopId}
  `;
  return { ok: true };
}

export async function goLiveShop(shopId: string): Promise<ActionResult> {
  const { shop } = await requireShopOwner(shopId);

  if (!shop.type || !shop.name || !shop.phone || !shop.hours || !shop.location) {
    return { ok: false, error: "Complete all onboarding steps first" };
  }

  const [{ count }] = (await db()`select count(*)::int as count from products where shop_id = ${shopId}`) as unknown as [
    { count: number },
  ];
  if (count < 3) {
    return { ok: false, error: "Add at least 3 products before going live" };
  }

  await db()`
    update shops set status = 'live', is_open = true, onboarding_step = 4, updated_at = ${Date.now()}
    where id = ${shopId}
  `;

  return { ok: true };
}

export async function toggleShopOpen(shopId: string, isOpen: boolean): Promise<ActionResult> {
  await requireShopOwner(shopId);
  await db()`update shops set is_open = ${isOpen}, updated_at = ${Date.now()} where id = ${shopId}`;
  return { ok: true };
}

export async function updateShopHours(
  shopId: string,
  hours: { open: string; close: string; days: number[] }
): Promise<ActionResult> {
  await requireShopOwner(shopId);
  const parsed = shopHoursSchema.safeParse(hours);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await db()`update shops set hours = ${db().json(parsed.data)}, updated_at = ${Date.now()} where id = ${shopId}`;
  return { ok: true };
}

/** Owner-editable shop identity (name + contact number) from the profile page. */
export async function updateShopProfile(
  shopId: string,
  input: { name: string; phone: string }
): Promise<ActionResult> {
  await requireShopOwner(shopId);
  const parsed = shopSeedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await db()`
    update shops set name = ${parsed.data.name}, phone = ${parsed.data.phone}, updated_at = ${Date.now()}
    where id = ${shopId}
  `;
  return { ok: true };
}

"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireUserId, requireShopOwner } from "@/lib/auth/guards";
import { toGeohash, nearestLocality } from "@/lib/geo/geohash";
import {
  shopTypeStepSchema,
  shopDetailsStepSchema,
  shopSeedSchema,
  shopHoursSchema,
  shopLocationStepSchema,
} from "@/lib/validation/shop";
import type { ShopDoc, Locality } from "@/types";
import type { z } from "zod";
import type { ActionResult } from "./types";
import { cache } from "react";

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

/** Dashboard layout + page both ask for the shop: one Firestore read per request (see getMe). */
export async function getMyShop(): Promise<ShopDoc | null> {
  return getMyShopOncePerRequest();
}

const getMyShopOncePerRequest = cache(async (): Promise<ShopDoc | null> => {
  const userId = await requireUserId();
  const snap = await adminDb().collection("shops").where("ownerId", "==", userId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return shopFromDoc(doc.id, doc.data());
});

async function ensureDraftShop(userId: string): Promise<string> {
  const existing = await adminDb().collection("shops").where("ownerId", "==", userId).limit(1).get();
  if (!existing.empty) return existing.docs[0]!.id;

  const now = Date.now();
  const ref = adminDb().collection("shops").doc();
  await ref.set({
    ownerId: userId,
    status: "draft",
    onboardingStep: 1,
    isOpen: false,
    type: null,
    name: "",
    phone: "",
    itemCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
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
  await adminDb()
    .collection("shops")
    .doc(shopId)
    .update({ name: parsed.data.name, phone: parsed.data.phone, updatedAt: Date.now() });
  return { ok: true };
}

export async function saveShopType(input: z.infer<typeof shopTypeStepSchema>): Promise<ActionResult<{ shopId: string }>> {
  const userId = await requireUserId();
  const parsed = shopTypeStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const shopId = await ensureDraftShop(userId);
  const ref = adminDb().collection("shops").doc(shopId);
  const current = (await ref.get()).data();
  await ref.update({
    type: parsed.data.type,
    onboardingStep: Math.max(current?.onboardingStep ?? 1, 2),
    updatedAt: Date.now(),
  });
  return { ok: true, data: { shopId } };
}

export async function saveShopDetails(
  shopId: string,
  input: z.infer<typeof shopDetailsStepSchema>
): Promise<ActionResult> {
  await requireShopOwner(shopId);
  const parsed = shopDetailsStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const ref = adminDb().collection("shops").doc(shopId);
  const current = (await ref.get()).data();
  await ref.update({
    name: parsed.data.name,
    phone: parsed.data.phone,
    hours: { open: parsed.data.open, close: parsed.data.close, days: parsed.data.days },
    onboardingStep: Math.max(current?.onboardingStep ?? 1, 3),
    updatedAt: Date.now(),
  });
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

  const localitiesSnap = await adminDb().collection("localities").get();
  const localities: Locality[] = localitiesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Locality, "id">),
  }));
  const nearest = nearestLocality({ lat, lng }, localities);

  const ref = adminDb().collection("shops").doc(shopId);
  const current = (await ref.get()).data();
  await ref.update({
    location: {
      lat,
      lng,
      geohash: toGeohash({ lat, lng }),
      address,
      localityId: nearest?.id ?? "",
    },
    onboardingStep: Math.max(current?.onboardingStep ?? 1, 4),
    updatedAt: Date.now(),
  });
  return { ok: true };
}

export async function goLiveShop(shopId: string): Promise<ActionResult> {
  const { shop: doc } = await requireShopOwner(shopId);
  const data = doc.data()!;

  if (!data.type || !data.name || !data.phone || !data.hours || !data.location) {
    return { ok: false, error: "Complete all onboarding steps first" };
  }

  const productsSnap = await adminDb().collection("shops").doc(shopId).collection("products").get();
  if (productsSnap.size < 3) {
    return { ok: false, error: "Add at least 3 products before going live" };
  }

  await adminDb().collection("shops").doc(shopId).update({
    status: "live",
    isOpen: true,
    onboardingStep: 4,
    updatedAt: Date.now(),
  });

  return { ok: true };
}

export async function toggleShopOpen(shopId: string, isOpen: boolean): Promise<ActionResult> {
  await requireShopOwner(shopId);
  await adminDb().collection("shops").doc(shopId).update({ isOpen, updatedAt: Date.now() });
  return { ok: true };
}

export async function updateShopHours(
  shopId: string,
  hours: { open: string; close: string; days: number[] }
): Promise<ActionResult> {
  await requireShopOwner(shopId);
  const parsed = shopHoursSchema.safeParse(hours);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await adminDb().collection("shops").doc(shopId).update({ hours: parsed.data, updatedAt: Date.now() });
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
  await adminDb()
    .collection("shops")
    .doc(shopId)
    .update({ name: parsed.data.name, phone: parsed.data.phone, updatedAt: Date.now() });
  return { ok: true };
}

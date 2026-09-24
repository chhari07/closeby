"use server";

import { auth } from "@clerk/nextjs/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  completeOnboardingSchema,
  type CompleteOnboardingInput,
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validation/user";
import { addressSchema, type AddressInput } from "@/lib/validation/order";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import type { ActionResult } from "./types";
import type { UserDoc, SavedAddress } from "@/types";
import { cache } from "react";

/** Thrown inside the transaction to signal "role is already set" without a retry. */
const ROLE_ALREADY_SET = "ROLE_ALREADY_SET";

export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const limited = rateLimit("completeOnboarding", userId);
  if (!limited.ok) return { ok: false, error: rateLimitMessage(limited.retryAfterSec) };

  const parsed = completeOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { role, name, phone } = parsed.data;

  const userRef = adminDb().collection("users").doc(userId);

  // Role is one-time and immutable. Read + write must be atomic, otherwise two
  // concurrent onboarding submits can both pass the "no role yet" check.
  try {
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (snap.exists && snap.data()?.role) {
        throw new Error(ROLE_ALREADY_SET);
      }

      tx.set(
        userRef,
        {
          role,
          name,
          phone,
          // Never write `undefined` — Firestore rejects it unless
          // ignoreUndefinedProperties is enabled on the settings.
          createdAt: snap.data()?.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === ROLE_ALREADY_SET) {
      return { ok: false, error: "Role already set" };
    }
    throw err;
  }

  return { ok: true };
}

/**
 * The navbar, the page's auth guard and the page itself each call getMe() —
 * cache() makes that one Firestore read per request instead of 2–3.
 * (A "use server" file may only export async functions, hence the wrapper.)
 */
export async function getMe(): Promise<(UserDoc & { id: string }) | null> {
  return getMeOncePerRequest();
}

const getMeOncePerRequest = cache(async (): Promise<(UserDoc & { id: string }) | null> => {
  const { userId } = await auth();
  if (!userId) return null;
  const doc = await adminDb().collection("users").doc(userId).get();
  if (!doc.exists) return null;
  const {
    createdAt,
    updatedAt: _updatedAt,
    ...data
  } = doc.data() as Omit<UserDoc, "createdAt"> & {
    createdAt?: { toMillis(): number } | number;
    updatedAt?: unknown;
  };
  void _updatedAt;
  // Firestore Timestamps can't cross the server→client boundary, and this
  // result is passed to client components — flatten to epoch millis.
  return {
    id: doc.id,
    ...data,
    createdAt:
      typeof createdAt === "number" ? createdAt : (createdAt?.toMillis() ?? 0),
  };
});

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };

  await adminDb()
    .collection("users")
    .doc(userId)
    .set(
      { ...parsed.data, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  return { ok: true };
}

export async function addSavedAddress(
  input: AddressInput,
): Promise<ActionResult<{ address: SavedAddress }>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };

  const address: SavedAddress = { ...parsed.data, id: randomUUID() };

  await adminDb()
    .collection("users")
    .doc(userId)
    .set(
      {
        savedAddresses: FieldValue.arrayUnion(address),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return { ok: true, data: { address } };
}
export async function deleteSavedAddress(
  addressId: string,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const ref = adminDb().collection("users").doc(userId);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const list =
      (snap.data()?.savedAddresses as SavedAddress[] | undefined) ?? [];
    tx.update(ref, {
      savedAddresses: list.filter((a) => a.id !== addressId),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
}

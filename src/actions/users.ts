"use server";

import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { db } from "@/lib/db/client";
import { findUser } from "@/lib/db/rows";
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

  // Role is one-time and immutable. The conditional upsert makes "no role
  // yet" check + write one atomic statement, so two concurrent onboarding
  // submits can't both set a role.
  const now = Date.now();
  const rows = await db()`
    insert into users (id, role, name, phone, created_at, updated_at)
    values (${userId}, ${role}, ${name}, ${phone}, ${now}, ${now})
    on conflict (id) do update
      set role = excluded.role, name = excluded.name, phone = excluded.phone, updated_at = excluded.updated_at
      where users.role is null
    returning id
  `;
  if (rows.length === 0) {
    return { ok: false, error: "Role already set" };
  }

  return { ok: true };
}

/**
 * The navbar, the page's auth guard and the page itself each call getMe() —
 * cache() makes that one database read per request instead of 2–3.
 * (A "use server" file may only export async functions, hence the wrapper.)
 */
export async function getMe(): Promise<(UserDoc & { id: string }) | null> {
  return getMeOncePerRequest();
}

const getMeOncePerRequest = cache(async (): Promise<(UserDoc & { id: string }) | null> => {
  const { userId } = await auth();
  if (!userId) return null;
  return findUser(userId);
});

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };

  const { name, phone } = parsed.data;
  const now = Date.now();
  // Upsert: the row may not exist yet (Firestore's set-with-merge did the same).
  await db()`
    insert into users (id, name, phone, created_at, updated_at)
    values (${userId}, ${name}, ${phone}, ${now}, ${now})
    on conflict (id) do update set name = excluded.name, phone = excluded.phone, updated_at = excluded.updated_at
  `;

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

  const now = Date.now();
  const added = db().json([address] as unknown as postgres.JSONValue);
  await db()`
    insert into users (id, saved_addresses, created_at, updated_at)
    values (${userId}, ${added}, ${now}, ${now})
    on conflict (id) do update set
      saved_addresses = users.saved_addresses || excluded.saved_addresses,
      updated_at = excluded.updated_at
  `;

  return { ok: true, data: { address } };
}
export async function deleteSavedAddress(
  addressId: string,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  // One statement, so it's atomic like the old transaction.
  await db()`
    update users set
      saved_addresses = coalesce(
        (select jsonb_agg(a) from jsonb_array_elements(saved_addresses) a where a->>'id' <> ${addressId}),
        '[]'::jsonb
      ),
      updated_at = ${Date.now()}
    where id = ${userId}
  `;
  return { ok: true };
}

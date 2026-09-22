import "server-only";
import { redirect, notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { adminDb } from "@/lib/firebase/admin";
import { getMe } from "@/actions/users";
import type { Role, UserDoc } from "@/types";

/**
 * Firestore is the only source of truth for role — Clerk's default session
 * token does NOT include publicMetadata (that requires a Dashboard-side
 * "customize session token" step), so sessionClaims.publicMetadata is
 * always undefined here. Never gate on it. Middleware only handles
 * "signed in or not"; every role-specific check happens here, backed by a
 * real Firestore read.
 */
export async function requireOnboardedUser(): Promise<UserDoc & { id: string }> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const me = await getMe();
  if (!me?.role) redirect("/onboarding/role");
  return me;
}

export async function requireRole(role: Role): Promise<UserDoc & { id: string }> {
  const me = await requireOnboardedUser();
  if (me.role !== role) notFound();
  return me;
}

// --- Server-action guards ------------------------------------------------
// The two above are for pages (they redirect/404). Server actions can't
// redirect a fetch call, so these throw instead — Step 1.9's single place
// for permission checks, replacing the same handful of lines that used to
// be duplicated in both src/actions/shops.ts and src/actions/products.ts.

/** Signed in or throw — the Clerk user id, nothing more. */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  return userId;
}

/** Signed in AND onboarded with the given role, or throw. */
async function requireUserWithRole(role: Role): Promise<string> {
  const userId = await requireUserId();
  const me = await getMe();
  if (me?.role !== role) {
    throw new Error(role === "buyer" ? "Buyers only" : "Shop owners only");
  }
  return userId;
}

export function requireBuyer(): Promise<string> {
  return requireUserWithRole("buyer");
}

export function requireOwner(): Promise<string> {
  return requireUserWithRole("shop_owner");
}

/** Given a known userId, throws unless they own shopId. Returns the shop
 *  doc so callers that need shop data (e.g. goLiveShop) don't re-read it. */
export async function assertShopOwnership(
  userId: string,
  shopId: string,
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const doc = await adminDb().collection("shops").doc(shopId).get();
  if (!doc.exists || doc.data()?.ownerId !== userId) {
    throw new Error("You do not own this shop");
  }
  return doc;
}

/** Signed in AND owns shopId, or throw. The one-call version of the above
 *  two for actions that don't need anything else (rate limiting etc.)
 *  interleaved in between. */
export async function requireShopOwner(
  shopId: string,
): Promise<{ userId: string; shop: FirebaseFirestore.DocumentSnapshot }> {
  const userId = await requireUserId();
  const shop = await assertShopOwnership(userId, shopId);
  return { userId, shop };
}

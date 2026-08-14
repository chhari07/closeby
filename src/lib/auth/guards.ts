import "server-only";
import { redirect, notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
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

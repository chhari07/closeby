import "server-only";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

/**
 * CloseBy operators (Step 5.6 dashboard). There's no admin role in the
 * database: the Clerk user ids listed in ADMIN_USER_IDS (comma-separated,
 * server-only env) are the operators. Unset = nobody.
 */
export function adminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdmin(userId: string | null | undefined): boolean {
  return Boolean(userId) && adminUserIds().includes(userId!);
}

/** For pages and actions: the operator's user id, or a 404 (the page doesn't exist for anyone else). */
export async function requireAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!isAdmin(userId)) notFound();
  return userId!;
}

import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getMe } from "@/actions/users";

/**
 * Sign-in / sign-up pages are pointless (and Clerk rejects them with
 * "You're already signed in") once a session exists. Send the user on:
 * onboarded → their home, signed in but no profile yet → finish onboarding.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;
  const me = await getMe();
  if (!me?.role) redirect("/onboarding/role");
  redirect(me.role === "shop_owner" ? "/shop/onboarding" : "/shops");
}

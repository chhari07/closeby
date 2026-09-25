import { auth } from "@clerk/nextjs/server";

/**
 * The signed-in Clerk user id for chrome rendered by the root layout
 * (navbar, footer). The middleware matcher skips static-file URLs
 * (.jpg, .png, …), so a 404 on one of those renders not-found through the
 * root layout without clerkMiddleware having run — and auth() throws
 * there. Treat that case as signed out instead of turning a 404 into a
 * server error.
 */
export async function layoutUserId(): Promise<string | null> {
  try {
    return (await auth()).userId;
  } catch {
    return null;
  }
}

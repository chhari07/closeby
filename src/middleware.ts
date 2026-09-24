import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/get-started",
  "/api/webhooks(.*)",
  "/inventory-samples(.*)",
]);

// Role-based gating (onboarding-complete, buyer vs shop-owner, live-shop
// checks) all live in lib/auth/guards.ts + individual layouts/pages, backed
// by real database reads. Clerk's default session token doesn't carry
// publicMetadata (would need a Dashboard-side "customize session token"
// step we don't have), so middleware can only reliably tell "signed in or
// not" — anything finer belongs at the resource level. This also matches
// Clerk's own current guidance away from path-matching middleware auth.
export default clerkMiddleware(async (authFn, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId, redirectToSignIn } = await authFn();
  if (!userId) return redirectToSignIn();

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

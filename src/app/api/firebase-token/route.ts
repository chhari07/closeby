import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminAuth } from "@/lib/firebase/admin";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Mints a Firebase custom auth token for the signed-in Clerk user so the
 * client SDK can authenticate with Firebase and satisfy security rules
 * that check request.auth.uid == Clerk user id.
 *
 * The uid here MUST stay the raw Clerk userId — shop docs store it as
 * `ownerId`, and rules compare the two directly.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit("firebaseToken", userId);
  if (!limited.ok) {
    return NextResponse.json(
      { error: rateLimitMessage(limited.retryAfterSec) },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  // Firebase rejects uids longer than 128 chars; Clerk ids are well under,
  // but a malformed session shouldn't produce an opaque 500.
  if (userId.length > 128) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  try {
    const token = await adminAuth().createCustomToken(userId);

    return NextResponse.json(
      { token },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    console.error("[firebase-token] createCustomToken failed", err);
    return NextResponse.json(
      { error: "Could not create auth token" },
      { status: 500 }
    );
  }
}
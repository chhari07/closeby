import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * sendBeacon target when a CloseBy tab closes: marks the person away at
 * once, so an alert right after they leave is emailed instead of waiting
 * for the heartbeat to go stale. Another open tab's next heartbeat (within
 * a minute) marks them present again.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 204 });
  await db()`update users set last_seen_at = 0 where id = ${userId}`;
  return new NextResponse(null, { status: 204 });
}

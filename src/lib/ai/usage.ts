import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/** Server-clock UTC day — a soft daily cap, not a billing-accurate boundary. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaySpendUsd(userId: string): Promise<number> {
  const doc = await adminDb().collection("aiUsage").doc(`${userId}_${todayKey()}`).get();
  const cost = doc.data()?.costUsd;
  return typeof cost === "number" ? cost : 0;
}

/** Called after every call, success or failure — a failed call still spent tokens. */
export async function recordUsage(userId: string, costUsd: number): Promise<void> {
  const date = todayKey();
  await adminDb()
    .collection("aiUsage")
    .doc(`${userId}_${date}`)
    .set(
      { userId, date, costUsd: FieldValue.increment(costUsd), requests: FieldValue.increment(1) },
      { merge: true },
    );
}

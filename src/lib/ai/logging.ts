import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { AiRunDoc } from "@/types/ai";

/** One log entry per run (safety checklist) — never skipped, even on error. */
export async function logAiRun(run: Omit<AiRunDoc, "id" | "createdAt">): Promise<void> {
  await adminDb()
    .collection("aiRuns")
    .add({ ...run, createdAt: Date.now() });
}

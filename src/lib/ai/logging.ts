import "server-only";
import { db } from "@/lib/db/client";
import type { AiRunDoc } from "@/types/ai";
import { checkAiCostJumpSoon } from "@/lib/ops-alerts";

/** One log entry per run (safety checklist) — never skipped, even on error. */
export async function logAiRun(run: Omit<AiRunDoc, "id" | "createdAt">): Promise<void> {
  await db()`insert into ai_runs ${db()({ ...run, errorMessage: run.errorMessage ?? null, createdAt: Date.now() })}`;
  if (run.costUsd > 0) checkAiCostJumpSoon(); // Step 5.6
}

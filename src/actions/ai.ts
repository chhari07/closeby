"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireUserId, assertShopOwnership } from "@/lib/auth/guards";
import { setHelperEnabled, getHelperStatusesForShop } from "@/lib/ai/settings";
import { bulkImportProducts } from "@/actions/products";
import { transitionOrder } from "@/actions/orders";
import type { ActionResult } from "./types";
import type { ApprovalDoc, AiHelperName } from "@/types/ai";

/**
 * Step 2.5 — the approval flow. The AI only ever wrote a `pending` doc in
 * `approvals` (src/lib/ai/tools/draft.ts); everything real happens here,
 * through the SAME server actions a human click would call, which
 * re-validate price/stock/ownership themselves. This file never writes an
 * order or a product directly.
 */

async function loadOwnPendingApproval(approvalId: string, userId: string) {
  const ref = adminDb().collection("approvals").doc(approvalId);
  const doc = await ref.get();
  if (!doc.exists) return { ref, approval: null as null };
  const approval = { id: doc.id, ...(doc.data() as Omit<ApprovalDoc, "id">) };
  if (approval.userId !== userId) return { ref, approval: null };
  return { ref, approval };
}

export async function listMyApprovals(): Promise<ApprovalDoc[]> {
  const userId = await requireUserId();
  const snap = await adminDb()
    .collection("approvals")
    .where("userId", "==", userId)
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ApprovalDoc, "id">) }));
}

export async function confirmApproval(
  approvalId: string,
): Promise<ActionResult<{ draft?: unknown }>> {
  const userId = await requireUserId();
  const { ref, approval } = await loadOwnPendingApproval(approvalId, userId);
  if (!approval) return { ok: false, error: "Approval not found" };
  if (approval.status !== "pending") return { ok: false, error: `Already ${approval.status}` };
  if (Date.now() > approval.expiresAt) {
    await ref.update({ status: "expired", decidedAt: Date.now() });
    return { ok: false, error: "This suggestion expired" };
  }

  let result: ActionResult<unknown> = { ok: true };

  if (approval.type === "draftOrderAdvice") {
    const draft = approval.draft as { orderId: string; decision: "ACCEPT" | "REJECT"; reason: string };
    result = await transitionOrder(
      draft.orderId,
      draft.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
      draft.reason,
    );
  } else if (approval.type === "draftStockList") {
    const draft = approval.draft as { shopId: string; items: unknown[] };
    result = await bulkImportProducts(draft.shopId, draft.items);
  } else if (approval.type === "draftCart") {
    // No direct write here — the buyer's cart UI applies the draft items
    // and goes through the ordinary placeOrder call, which re-checks price
    // and stock itself, same as any hand-built cart.
    result = { ok: true, data: approval.draft };
  }

  if (!result.ok) return result as ActionResult<{ draft?: unknown }>;

  await ref.update({ status: "approved", decidedAt: Date.now() });
  return { ok: true, data: approval.type === "draftCart" ? { draft: approval.draft } : undefined };
}

export async function rejectApproval(approvalId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const { ref, approval } = await loadOwnPendingApproval(approvalId, userId);
  if (!approval) return { ok: false, error: "Approval not found" };
  if (approval.status !== "pending") return { ok: true };
  await ref.update({ status: "rejected", decidedAt: Date.now() });
  return { ok: true };
}

// --- Owner-facing AI helper toggle (settings page) -------------------------

export async function getMyShopAiSettings(shopId: string): Promise<Record<AiHelperName, boolean>> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);
  return getHelperStatusesForShop(shopId);
}

export async function setMyShopAiHelperEnabled(
  shopId: string,
  helper: AiHelperName,
  enabled: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);
  await setHelperEnabled(helper, enabled, shopId);
  return { ok: true };
}

"use server";

import { db } from "@/lib/db/client";
import { findProduct, toApproval } from "@/lib/db/rows";
import { pendingShopIdeas, type ShopIdeaDraft } from "@/lib/shop-ideas";
import { formatPaise } from "@/lib/money";
import { requireUserId, assertShopOwnership } from "@/lib/auth/guards";
import { setHelperEnabled, getHelperStatusesForShop } from "@/lib/ai/settings";
import { bulkImportProducts, updateProduct } from "@/actions/products";
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
  const [row] = await db()`select * from approvals where id = ${approvalId}`;
  if (!row) return { approval: null };
  const approval = toApproval(row);
  if (approval.userId !== userId) return { approval: null };
  return { approval };
}

async function decideApproval(
  approvalId: string,
  status: "approved" | "rejected" | "expired",
  edited?: boolean,
): Promise<void> {
  await db()`
    update approvals set status = ${status}, decided_at = ${Date.now()}, edited = ${edited ?? null}
    where id = ${approvalId}
  `;
}

export async function listMyApprovals(): Promise<ApprovalDoc[]> {
  const userId = await requireUserId();
  const rows = await db()`
    select * from approvals
    where user_id = ${userId} and status = 'pending'
    order by created_at desc
    limit 20
  `;
  return rows.map(toApproval);
}

/**
 * `stockItems` (draftStockList only): the owner's corrected rows from the
 * review table — prices fixed, rows removed. They go through
 * bulkImportProducts' own per-row validation exactly like a JSON/CSV import,
 * so they're trusted no more than a file the owner uploads.
 */
export async function confirmApproval(
  approvalId: string,
  edits?: { stockItems?: unknown[] },
): Promise<ActionResult<unknown>> {
  const userId = await requireUserId();
  const { approval } = await loadOwnPendingApproval(approvalId, userId);
  if (!approval) return { ok: false, error: "Approval not found" };
  if (approval.status !== "pending") return { ok: false, error: `Already ${approval.status}` };
  if (Date.now() > approval.expiresAt) {
    await decideApproval(approvalId, "expired");
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
    const items = edits?.stockItems ?? draft.items;
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "No items left to import" };
    if (items.length > 50) return { ok: false, error: "Too many items" };
    result = await bulkImportProducts(draft.shopId, items);
  } else if (approval.type === "draftCart") {
    // No direct write here — the buyer's cart UI applies the draft items
    // and goes through the ordinary placeOrder call, which re-checks price
    // and stock itself, same as any hand-built cart.
    result = { ok: true, data: approval.draft };
  }

  if (!result.ok) return result;

  // `edited` feeds the accept-rate numbers (3.4): approved as-is vs. corrected first.
  await decideApproval(approvalId, "approved", Boolean(edits?.stockItems));
  // draftCart has no underlying action result to hand back (see above) — give
  // the caller the draft itself instead. draftOrderAdvice/draftStockList hand
  // back whatever transitionOrder/bulkImportProducts actually returned (e.g.
  // bulkImportProducts' {products, failed}), so the caller can update its own
  // UI state the same way it would from a manual action call.
  return { ok: true, data: approval.type === "draftCart" ? { draft: approval.draft } : result.data };
}

export async function rejectApproval(approvalId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const { approval } = await loadOwnPendingApproval(approvalId, userId);
  if (!approval) return { ok: false, error: "Approval not found" };
  if (approval.status !== "pending") return { ok: true };
  await decideApproval(approvalId, "rejected");
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

// --- Step 3.3: owner restock & price ideas ----------------------------------

export async function listMyShopIdeas(shopId: string): Promise<(ApprovalDoc & { draft: ShopIdeaDraft })[]> {
  const userId = await requireUserId();
  await assertShopOwnership(userId, shopId);
  return pendingShopIdeas(userId, shopId);
}

/**
 * The owner acts on an idea. `price` (rupees) applies a price idea — the
 * AI's or the owner's own number — through the normal updateProduct action,
 * checked against the product's CURRENT MRP. Without a price the idea is
 * just marked done (a restock idea never changes stock by itself: it's the
 * owner's list for the supplier).
 */
export async function applyShopIdea(approvalId: string, price?: number): Promise<ActionResult> {
  const userId = await requireUserId();
  const { approval } = await loadOwnPendingApproval(approvalId, userId);
  if (!approval || approval.type !== "shopIdea") return { ok: false, error: "Idea not found" };
  if (approval.status !== "pending") return { ok: false, error: `Already ${approval.status}` };
  if (Date.now() > approval.expiresAt) {
    await decideApproval(approvalId, "expired");
    return { ok: false, error: "This idea expired — get fresh ideas" };
  }
  const draft = approval.draft as ShopIdeaDraft;
  await assertShopOwnership(userId, draft.shopId);

  let edited = false;
  if (price !== undefined) {
    if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Enter a valid price" };
    const paise = Math.round(price * 100);
    const product = await findProduct(draft.shopId, draft.productId);
    if (!product) return { ok: false, error: "This product no longer exists" };
    if (typeof product.mrp === "number" && product.mrp > 0 && paise > product.mrp) {
      return { ok: false, error: `Price can't be above the MRP (${formatPaise(product.mrp)})` };
    }
    const result = await updateProduct(draft.shopId, draft.productId, { price: paise });
    if (!result.ok) return result;
    edited = paise !== draft.suggestedPrice;
  }

  await decideApproval(approvalId, "approved", edited);
  return { ok: true };
}

// Step 2 (AI Foundation) — types for the four collections in
// docs/closeby-ai-roadmap-steps.txt §2.4. Kept separate from src/types/index.ts
// since these are AI-plumbing types, not storefront/order domain types.

export type AiHelperName = "hello" | "buyerCartDraft" | "orderAdvice" | "stockDraft" | "orderHelp" | "chatReply";

export type AiRunResult = "ok" | "error" | "refused" | "invalid_output";

/** One row per model call — the "one log entry per run" safety rule. */
export interface AiRunDoc {
  id: string;
  userId: string;
  helper: AiHelperName;
  model: string;
  /** Truncated, never the raw buyer/owner text verbatim with PII. */
  inputSummary: string;
  toolsUsed: string[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  result: AiRunResult;
  errorMessage?: string;
  createdAt: number;
}

export type ApprovalType = "draftCart" | "draftStockList" | "draftOrderAdvice";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/**
 * A DRAFT the AI wrote — never a real write. `draft`'s shape depends on
 * `type`; confirmApproval (src/actions/ai.ts) is the only place that reads
 * it and re-validates before doing anything real.
 */
export interface ApprovalDoc {
  id: string;
  userId: string;
  shopId?: string;
  type: ApprovalType;
  draft: unknown;
  status: ApprovalStatus;
  createdAt: number;
  decidedAt?: number;
  /** Approvals expire 24h after creation (roadmap §2.5). */
  expiresAt: number;
}

/** Spend-limit counter, one doc per user per day: id = `${userId}_${date}`. */
export interface AiUsageDoc {
  userId: string;
  date: string; // YYYY-MM-DD
  costUsd: number;
  requests: number;
}

/**
 * On/off + spend-limit config. Global doc id = helper name; a per-shop
 * override doc id = `${helper}__${shopId}` (owner's own kill switch for
 * their shop, layered on top of the global one).
 */
export interface AiSettingsDoc {
  helper: AiHelperName;
  shopId: string | null;
  enabled: boolean;
  dailyLimitUsd?: number;
}

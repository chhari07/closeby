import "server-only";
import type { Role } from "@/types";

/**
 * Server-injected per-run context (roadmap §2.3: "Server injects userId /
 * shopId. Tools return only real records"). Never built from request-body
 * or model-supplied fields — the route constructs this once from the
 * authenticated session and passes it to every tool's closure.
 */
export interface ToolContext {
  userId: string;
  role: Role;
  /** The one shop this run is scoped to (owner helpers only). */
  shopId?: string;
  /** The one order this run is scoped to (orderAdvice only). */
  orderId?: string;
}

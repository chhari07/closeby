import type { OrderStatus } from "@/types";

export type Actor = "buyer" | "shop";

interface Transition {
  to: OrderStatus;
  by: Actor;
  reasonRequired?: boolean;
}

// The single source of truth for order state transitions. Server actions
// must check every transition against this map and reject anything absent
// from it — never trust the client to only send valid transitions.
export const ORDER_TRANSITIONS: Record<OrderStatus, Transition[]> = {
  PLACED: [
    { to: "ACCEPTED", by: "shop" },
    { to: "REJECTED", by: "shop", reasonRequired: true },
    { to: "CANCELLED", by: "buyer" },
  ],
  ACCEPTED: [
    { to: "PREPARING", by: "shop" },
    { to: "CANCELLED", by: "shop", reasonRequired: true },
  ],
  PREPARING: [{ to: "READY", by: "shop" }],
  READY: [{ to: "COMPLETED", by: "shop" }],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function isValidTransition(
  from: OrderStatus,
  to: OrderStatus,
  by: Actor
): { ok: true; reasonRequired: boolean } | { ok: false } {
  const allowed = ORDER_TRANSITIONS[from].find((t) => t.to === to && t.by === by);
  if (!allowed) return { ok: false };
  return { ok: true, reasonRequired: !!allowed.reasonRequired };
}

export const TERMINAL_STATUSES: OrderStatus[] = ["COMPLETED", "REJECTED", "CANCELLED"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

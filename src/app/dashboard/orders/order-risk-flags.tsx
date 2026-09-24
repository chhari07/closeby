"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markOrderRiskReviewed } from "@/actions/auto-accept";
import type { OrderDoc } from "@/types";

/**
 * Step 5.2 — warnings about a possibly fake / abusive order, for the owner
 * to check. Only a flag: accepting or rejecting is still the owner's call.
 */
export function OrderRiskFlags({ order }: { order: OrderDoc }) {
  const flags = order.riskFlags ?? [];
  const [reviewed, setReviewed] = useState(Boolean(order.riskReviewedAt));
  const [busy, setBusy] = useState(false);
  if (flags.length === 0) return null;

  if (reviewed) {
    return (
      <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
        <ShieldCheck className="size-3.5" /> {flags.length} warning{flags.length === 1 ? "" : "s"} checked by you
      </p>
    );
  }

  const high = flags.some((f) => f.level === "high");

  async function markReviewed() {
    setBusy(true);
    const result = await markOrderRiskReviewed(order.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    setReviewed(true);
  }

  return (
    <div
      className={`mt-2 rounded-lg border p-2.5 text-sm ${
        high ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      }`}
    >
      <p className="flex items-center gap-1.5 font-medium">
        <ShieldAlert className="size-4" /> Check before accepting
      </p>
      <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-xs">
        {flags.map((f) => (
          <li key={f.code + f.text} className={f.level === "high" ? "font-semibold" : ""}>
            {f.text}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs opacity-80">Call the buyer if unsure. Nothing is blocked automatically.</p>
        <Button size="sm" variant="outline" className="bg-background shrink-0" disabled={busy} onClick={markReviewed}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Looks fine"}
        </Button>
      </div>
    </div>
  );
}

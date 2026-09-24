"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmApproval, rejectApproval } from "@/actions/ai";

interface StockLine {
  productId: string;
  name: string;
  unit: string;
  ordered: number;
  available: number;
  shortBy: number;
}

interface AdviceResponse {
  approvalId: string;
  decision: "ACCEPT" | "REJECT";
  confidence: number;
  summary: string;
  stock?: StockLine[];
}

type Stage = "idle" | "loading" | "result" | "error";

/**
 * Step 3.2 (Flow C: order helper), owner-facing half. Deliberately a
 * manual "Ask AI" tap rather than firing automatically on every new order
 * (the roadmap's own wording) — an AI call costs real money per order, and
 * the owner-in-control principle (Step 2.6's per-helper switch) argues for
 * the owner deciding per-order whether they want the suggestion, not it
 * running unconditionally on every PLACED order regardless of whether they
 * needed the help. Easy to flip to automatic later if that's wanted.
 */
export function OrderAiSuggestion({
  shopId,
  orderId,
  onApplied,
}: {
  shopId: string;
  orderId: string;
  onApplied?: () => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask() {
    setStage("loading");
    try {
      const res = await fetch("/api/ai/orderAdvice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "Should I accept this order?", shopId, orderId }),
      });
      const body: { data?: AdviceResponse; error?: string } = await res.json();
      if (!res.ok || !body.data) {
        setErrorMsg(body.error ?? "AI suggestion isn't available right now.");
        setStage("error");
        return;
      }
      setAdvice(body.data);
      setStage("result");
    } catch {
      setErrorMsg("Couldn't reach the AI helper.");
      setStage("error");
    }
  }

  async function confirm() {
    if (!advice) return;
    setBusy(true);
    const result = await confirmApproval(advice.approvalId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not apply this suggestion");
      return;
    }
    toast.success(advice.decision === "ACCEPT" ? "Order accepted" : "Order rejected");
    setStage("idle");
    setAdvice(null);
    onApplied?.();
  }

  async function dismiss() {
    if (advice) {
      setBusy(true);
      await rejectApproval(advice.approvalId);
      setBusy(false);
    }
    setStage("idle");
    setAdvice(null);
  }

  if (stage === "idle") {
    return (
      <Button size="sm" variant="outline" onClick={ask}>
        <Sparkles className="size-3.5" /> Ask AI
      </Button>
    );
  }

  if (stage === "loading") {
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" /> Checking stock and order details…
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 text-xs">
        <span className="text-destructive">{errorMsg}</span>
        <Button size="sm" variant="ghost" onClick={() => setStage("idle")}>
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-accent/40 flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
      <div className="flex items-center gap-2">
        <Badge variant={advice!.decision === "ACCEPT" ? "default" : "destructive"}>
          AI suggests: {advice!.decision === "ACCEPT" ? "Accept" : "Reject"}
        </Badge>
        <span className="text-muted-foreground">{Math.round(advice!.confidence * 100)}% confident</span>
      </div>
      <p>{advice!.summary}</p>
      <StockShortfall lines={advice!.stock ?? []} />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={confirm}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Do this
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={dismiss}>
          <X className="size-3.5" /> Ignore
        </Button>
      </div>
    </div>
  );
}

/** Which ordered products the shop can't fully cover, and by how much. */
function StockShortfall({ lines }: { lines: StockLine[] }) {
  if (lines.length === 0) return null;
  const short = lines.filter((l) => l.shortBy > 0);
  if (short.length === 0) {
    return <p className="text-muted-foreground">All {lines.length} products are in stock.</p>;
  }
  return (
    <div className="border-destructive/30 bg-destructive/5 rounded-md border p-2">
      <p className="text-destructive mb-1.5 flex items-center gap-1.5 font-medium">
        <AlertTriangle className="size-3.5" />
        {short.length} of {lines.length} product{lines.length === 1 ? "" : "s"} short on stock
      </p>
      <ul className="flex flex-col gap-1">
        {short.map((l) => (
          <li key={l.productId} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">
              {l.name} <span className="text-muted-foreground">({l.unit})</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {l.available === 0 ? (
                <span className="text-destructive">Out of stock · need {l.ordered}</span>
              ) : (
                <>
                  Ordered {l.ordered} · have {l.available} ·{" "}
                  <span className="text-destructive">short {l.shortBy}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

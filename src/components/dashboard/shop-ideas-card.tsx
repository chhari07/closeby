"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Lightbulb, Loader2, PackagePlus, Snail, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyShopIdea, getShopIdeasStatus, listMyShopIdeas, rejectApproval } from "@/actions/ai";
import { useOrderSignals } from "@/lib/hooks/use-order-signals";
import { formatPaise } from "@/lib/money";
import type { ApprovalDoc } from "@/types/ai";
import type { IdeasStatus, ShopIdeaDraft } from "@/lib/shop-ideas";

type Idea = ApprovalDoc & { draft: ShopIdeaDraft };

const KIND = {
  restock: { label: "Restock", icon: PackagePlus, tone: "bg-orange-100 text-orange-700" },
  price: { label: "Price idea", icon: Tag, tone: "bg-emerald-100 text-emerald-700" },
  slow: { label: "Slow item", icon: Snail, tone: "bg-slate-100 text-slate-700" },
} as const;

const rupees = (paise: number) => String(Math.round(paise / 100));

/**
 * Step 3.3 — the owner's AI restock & price ideas. Ideas are suggestions
 * only: a price changes when the owner presses Apply (and never above MRP);
 * a restock idea never touches stock.
 *
 * "Get ideas" is only offered when it can say something new: the first
 * time, after sales / stock / prices changed, or 6 hours later (the server
 * enforces the same rule). After a week the ideas refresh by themselves.
 */
export function ShopIdeasCard({
  shopId,
  initialIdeas,
  initialStatus,
}: {
  shopId: string;
  initialIdeas: Idea[];
  initialStatus: IdeasStatus;
}) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    void getShopIdeasStatus(shopId)
      .then(setStatus)
      .catch(() => {});
  }, [shopId]);

  // A new order (or a status change) may make fresh ideas worthwhile.
  useOrderSignals(`shop-orders:${shopId}`, refreshStatus);
  // The dashboard re-renders every few seconds; pick up its fresher status.
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus.generatedAt, initialStatus.canRefresh, initialStatus.dataChanged]); // eslint-disable-line react-hooks/exhaustive-deps

  async function getIdeas(auto = false) {
    setLoading(true);
    setAutoRunning(auto);
    setNote(null);
    try {
      const res = await fetch("/api/ai/shopIdeas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      const body: { data?: { count: number; summary: string }; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !body.data) {
        toast.error(body.error ?? "Couldn't get ideas right now");
        return;
      }
      const [fresh, freshStatus] = await Promise.all([listMyShopIdeas(shopId), getShopIdeasStatus(shopId)]);
      setIdeas(fresh);
      setStatus(freshStatus);
      setNote(fresh.length === 0 ? body.data.summary || "Nothing to suggest right now." : body.data.summary);
    } catch {
      if (!auto) toast.error("Couldn't reach the AI helper");
    } finally {
      setLoading(false);
      setAutoRunning(false);
    }
  }

  // Weekly: ideas older than 7 days refresh on their own when the dashboard opens.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || !status.autoRefreshDue || !status.canRefresh) return;
    autoTried.current = true;
    void getIdeas(true);
    // Runs once per visit, when the status first says a refresh is due.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.autoRefreshDue, status.canRefresh]);

  const upToDate = status.generatedAt !== null && !status.canRefresh;

  const remove = (id: string) => setIdeas((list) => list.filter((i) => i.id !== id));

  return (
    <div className="bg-card rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-amber-500" />
          <p className="font-semibold">AI ideas</p>
          <span className="text-muted-foreground text-xs">restock &amp; prices, from your last 30 days of sales</span>
        </div>
        <Button size="sm" variant="outline" disabled={loading || upToDate} onClick={() => getIdeas()}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : upToDate ? <CheckCircle2 className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {upToDate ? "Up to date" : status.generatedAt ? "Refresh ideas" : "Get ideas"}
        </Button>
      </div>

      {status.generatedAt !== null && (
        <p className="text-muted-foreground mb-3 text-xs">
          {autoRunning
            ? "Updating your weekly ideas…"
            : `Made ${formatDistanceToNow(new Date(status.generatedAt), { addSuffix: true })}. `}
          {!autoRunning &&
            (upToDate
              ? `New ideas when your sales or stock change, or after ${format(new Date(status.nextRefreshAt!), "h:mm a")}.`
              : status.dataChanged
                ? "Your sales or stock changed since — refresh for new ideas."
                : "You can refresh them now.")}
        </p>
      )}

      {note && <p className="text-muted-foreground mb-3 text-sm">{note}</p>}

      {ideas.length === 0 ? (
        !note && (
          <p className="text-muted-foreground text-sm">
            No ideas yet. Press <b>Get ideas</b> — nothing changes in your shop unless you press Apply.
          </p>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {ideas.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} onDone={() => remove(idea.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IdeaRow({ idea, onDone }: { idea: Idea; onDone: () => void }) {
  const d = idea.draft;
  const kind = KIND[d.kind];
  const Icon = kind.icon;
  const [price, setPrice] = useState(d.suggestedPrice ? rupees(d.suggestedPrice) : "");
  const [busy, setBusy] = useState(false);
  const f = d.facts;

  async function act(kindOfAction: "apply" | "done" | "dismiss") {
    setBusy(true);
    const result =
      kindOfAction === "dismiss"
        ? await rejectApproval(idea.id)
        : await applyShopIdea(idea.id, kindOfAction === "apply" ? Number(price) : undefined);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not update");
      return;
    }
    if (kindOfAction === "apply") toast.success(`Price updated — ${d.productName} is now ₹${price}`);
    onDone();
  }

  return (
    <li className="rounded-xl border p-3">
      <div className="flex items-start gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${kind.tone}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="text-muted-foreground text-xs font-medium">{kind.label} · </span>
            <span className="font-semibold">{d.productName}</span>{" "}
            <span className="text-muted-foreground text-xs">({d.unit})</span>
          </p>
          <p className="mt-0.5 text-sm">{d.reason}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {f.stock} in stock · {f.sold30d} sold in 30 days (~{f.perDay}/day)
            {f.daysLeft !== null ? ` · runs out in ~${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"}` : ""} · now{" "}
            {formatPaise(f.price)}
            {f.mrp ? ` · MRP ${formatPaise(f.mrp)}` : ""}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {d.kind === "restock" && (
              <>
                <span className="rounded-md bg-orange-50 px-2 py-1 text-sm font-medium text-orange-800">
                  Order about {d.suggestedQty}
                </span>
                <Button size="sm" disabled={busy} onClick={() => act("done")}>
                  Done
                </Button>
              </>
            )}
            {d.suggestedPrice !== undefined && (
              <>
                <span className="flex items-center gap-1 text-sm">
                  ₹
                  <Input
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="decimal"
                    className="h-8 w-20"
                    aria-label="New price in rupees"
                  />
                </span>
                <Button size="sm" disabled={busy || !price} onClick={() => act("apply")}>
                  Apply
                </Button>
              </>
            )}
            {d.kind === "slow" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act("done")}>
                Got it
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("dismiss")}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

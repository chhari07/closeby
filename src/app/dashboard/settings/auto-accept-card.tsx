"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveAutoAcceptRules, type AutoAcceptSettings } from "@/actions/auto-accept";
import { PAYMENT_METHOD_LABEL } from "@/lib/orders/auto-accept";
import type { PaymentMethod } from "@/types";

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

/**
 * Step 5.1 — the owner's auto-accept rules. Off until the owner turns it on,
 * which needs a high accept rate first; the owner can turn it off any time.
 */
export function AutoAcceptCard({ shopId, initial }: { shopId: string; initial: AutoAcceptSettings }) {
  const [enabled, setEnabled] = useState(initial.rules.enabled);
  const [maxRupees, setMaxRupees] = useState(String(initial.rules.maxOrderValue / 100));
  const [methods, setMethods] = useState<PaymentMethod[]>(initial.rules.paymentMethods);
  const [saving, setSaving] = useState(false);
  const { readiness, results } = initial;
  const locked = !readiness.ready && !initial.rules.enabled;

  async function save(nextEnabled = enabled) {
    const max = Number(maxRupees);
    if (!Number.isFinite(max) || max <= 0) {
      toast.error("Enter the largest order to auto-accept, in rupees");
      return;
    }
    setSaving(true);
    const result = await saveAutoAcceptRules(shopId, {
      enabled: nextEnabled,
      maxOrderValue: Math.round(max * 100),
      paymentMethods: methods,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    setEnabled(nextEnabled);
    toast.success(nextEnabled ? "Auto-accept is on" : "Auto-accept is off");
  }

  function toggleMethod(m: PaymentMethod) {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-medium">
            <Zap className="size-4" /> Auto-accept orders
          </p>
          <p className="text-muted-foreground text-xs">
            Orders that match your rules are accepted for you. The shop must be open and within its hours, and
            orders with warnings always wait for you.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={saving || locked}
          onCheckedChange={(v) => save(v)}
          aria-label="Auto-accept orders"
        />
      </div>

      <p className={`flex items-start gap-1.5 text-xs ${readiness.ready ? "text-status-ready" : "text-muted-foreground"}`}>
        {!readiness.ready && <Lock className="mt-0.5 size-3.5 shrink-0" />}
        {readiness.ready ? `✓ ${readiness.detail}` : readiness.detail}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auto-max">Largest order to auto-accept (₹)</Label>
        <Input
          id="auto-max"
          type="number"
          inputMode="numeric"
          min={1}
          value={maxRupees}
          onChange={(e) => setMaxRupees(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Payment types</Label>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <label
              key={m}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 ${
                methods.includes(m) ? "border-primary bg-accent" : "border-border"
              }`}
            >
              <Checkbox checked={methods.includes(m)} onCheckedChange={() => toggleMethod(m)} />
              <span className="text-sm">{PAYMENT_METHOD_LABEL[m]}</span>
            </label>
          ))}
        </div>
      </div>

      <Button className="min-h-11" variant="outline" disabled={saving} onClick={() => save()}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Save rules"}
      </Button>

      <p className="text-muted-foreground text-xs">
        Last 30 days: {results.accepted} order{results.accepted === 1 ? "" : "s"} auto-accepted
        {results.accepted > 0 ? `, ${results.cancelledLater} later cancelled by you` : ""}.
      </p>
    </Card>
  );
}

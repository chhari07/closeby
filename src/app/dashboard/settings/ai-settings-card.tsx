"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { setMyShopAiHelperEnabled } from "@/actions/ai";
import type { AiHelperName } from "@/types/ai";

const TOGGLABLE_HELPERS: { name: AiHelperName; label: string }[] = [
  { name: "orderAdvice", label: "Order accept/reject suggestions" },
  { name: "stockDraft", label: "Voice/text stock import" },
  { name: "buyerCartDraft", label: "Buyer sentence-to-cart (affects your shop's listing)" },
];

/** Roadmap §2.6/§2.9 — the owner-facing on/off switch + a "hello" test call. */
export function AiSettingsCard({
  shopId,
  initialStatuses,
}: {
  shopId: string;
  initialStatuses: Record<AiHelperName, boolean>;
}) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [busy, setBusy] = useState<AiHelperName | "test" | null>(null);

  async function toggle(helper: AiHelperName) {
    const next = !statuses[helper];
    setBusy(helper);
    const result = await setMyShopAiHelperEnabled(shopId, helper, next);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "Could not update");
      return;
    }
    setStatuses((prev) => ({ ...prev, [helper]: next }));
  }

  async function testConnection() {
    setBusy("test");
    try {
      const res = await fetch("/api/ai/hello", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "ping", shopId }),
      });
      const body: { data?: { message?: string }; error?: string } = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "AI connection failed");
        return;
      }
      toast.success(body.data?.message ?? "AI connection OK");
    } catch {
      toast.error("AI connection failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <p className="font-medium">AI helpers</p>
        <p className="text-muted-foreground text-xs">
          Every helper only ever drafts a suggestion for you to confirm — nothing changes on its own.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {TOGGLABLE_HELPERS.map(({ name, label }) => (
          <div key={name} className="flex items-center justify-between gap-3">
            <span className="text-sm">{label}</span>
            <Button
              variant={statuses[name] ? "default" : "outline"}
              size="sm"
              disabled={busy === name}
              onClick={() => toggle(name)}
            >
              {busy === name ? (
                <Loader2 className="size-4 animate-spin" />
              ) : statuses[name] ? (
                "On"
              ) : (
                "Off"
              )}
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" className="min-h-11" disabled={busy === "test"} onClick={testConnection}>
        {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : "Test AI connection"}
      </Button>
    </Card>
  );
}

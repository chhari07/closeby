"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { setEmailAlerts } from "@/actions/presence";

/** On/off for email alerts sent while the person isn't on CloseBy (Step 5.4). */
export function EmailAlertsCard({ initial, email, role }: { initial: boolean; email: string; role: "buyer" | "shop_owner" }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setSaving(true);
    const result = await setEmailAlerts(next);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    setOn(next);
    toast.success(next ? "Email alerts on" : "Email alerts off");
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Mail className="text-primary mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Email alerts</p>
            <p className="text-muted-foreground text-sm">
              {role === "shop_owner"
                ? "New orders and buyer messages"
                : "Order updates, refunds and shop messages"}{" "}
              are emailed to <b>{email || "your account email"}</b> when you&apos;re not on CloseBy.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Email alerts"
          disabled={saving}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            on ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
    </Card>
  );
}

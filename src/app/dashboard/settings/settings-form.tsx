"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { OpenToggle } from "@/components/dashboard/open-toggle";
import { updateShopHours } from "@/actions/shops";
import type { ShopDoc } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SettingsForm({ shop }: { shop: ShopDoc }) {
  const [open, setOpenTime] = useState(shop.hours?.open ?? "09:00");
  const [close, setCloseTime] = useState(shop.hours?.close ?? "21:00");
  const [days, setDays] = useState<number[]>(shop.hours?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function handleSave() {
    if (days.length === 0) {
      toast.error("Pick at least one working day");
      return;
    }
    setSubmitting(true);
    const result = await updateShopHours(shop.id, { open, close, days });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    toast.success("Hours updated");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between p-4">
        <div>
          <p className="font-medium">Shop status</p>
          <p className="text-muted-foreground text-xs">
            Closing hides your shop from buyer search immediately.
          </p>
        </div>
        <OpenToggle />
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <p className="font-medium">Working hours</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="open">Opens at</Label>
            <Input id="open" type="time" value={open} onChange={(e) => setOpenTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="close">Closes at</Label>
            <Input id="close" type="time" value={close} onChange={(e) => setCloseTime(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Working days</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label
                key={d}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 ${
                  days.includes(i) ? "border-primary bg-accent" : "border-border"
                }`}
              >
                <Checkbox checked={days.includes(i)} onCheckedChange={() => toggleDay(i)} />
                <span className="text-sm">{d}</span>
              </label>
            ))}
          </div>
        </div>
        <Button className="min-h-11" disabled={submitting} onClick={handleSave}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : "Save hours"}
        </Button>
      </Card>
    </div>
  );
}

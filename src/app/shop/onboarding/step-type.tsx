"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Store,
  Pill,
  Pencil,
  Croissant,
  Cpu,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHOP_TYPES, type ShopDoc, type ShopType } from "@/types";
import { saveShopType, getMyShop } from "@/actions/shops";

const ICONS: Record<ShopType, React.ComponentType<{ className?: string }>> = {
  kirana: Store,
  pharmacy: Pill,
  stationery: Pencil,
  bakery: Croissant,
  electronics: Cpu,
  other: Package,
};

export function StepType({
  initialType,
  onSaved,
}: {
  initialType: ShopType | null;
  onSaved: (shop: ShopDoc) => void;
}) {
  const [selected, setSelected] = useState<ShopType | null>(initialType);
  const [submitting, setSubmitting] = useState(false);

  async function handleNext() {
    if (!selected) {
      toast.error("Pick a shop type to continue");
      return;
    }
    setSubmitting(true);
    const result = await saveShopType({ type: selected });
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      setSubmitting(false);
      return;
    }
    const shop = await getMyShop();
    setSubmitting(false);
    if (shop) onSaved(shop);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SHOP_TYPES.map(({ value, label }) => {
          const Icon = ICONS[value];
          const active = selected === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setSelected(value)}
              className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                active ? "border-primary bg-accent" : "border-border"
              }`}
            >
              <Icon className="size-6" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          );
        })}
      </div>
      <Button size="lg" className="min-h-11" disabled={submitting} onClick={handleNext}>
        {submitting ? "Saving..." : "Next"}
      </Button>
    </div>
  );
}

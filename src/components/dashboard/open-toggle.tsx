"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useShop } from "./shop-context";
import { toggleShopOpen } from "@/actions/shops";

export function OpenToggle() {
  const { shop, setShop } = useShop();
  const [pending, setPending] = useState(false);

  async function handleChange(nextOpen: boolean) {
    setShop({ ...shop, isOpen: nextOpen }); // optimistic
    setPending(true);
    const result = await toggleShopOpen(shop.id, nextOpen);
    setPending(false);
    if (!result.ok) {
      setShop({ ...shop, isOpen: !nextOpen }); // revert
      toast.error(result.error ?? "Could not update shop status");
      return;
    }
    if (!nextOpen) {
      toast.warning("Your shop is now hidden from buyers. Existing orders still need to be completed.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-medium ${shop.isOpen ? "text-status-ready" : "text-status-stopped"}`}>
        {shop.isOpen ? "Open" : "Closed"}
      </span>
      <Switch checked={shop.isOpen} disabled={pending} onCheckedChange={handleChange} />
    </div>
  );
}

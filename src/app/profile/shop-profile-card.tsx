"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, MapPin, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateShopProfile } from "@/actions/shops";
import { shopSeedSchema } from "@/lib/validation/shop";
import { SHOP_TYPES, type ShopDoc } from "@/types";

/** Shop owner's shop identity: name + contact number, plus a summary of the rest. */
export function ShopProfileCard({ shop }: { shop: ShopDoc }) {
  const router = useRouter();
  const [name, setName] = useState(shop.name);
  const [phone, setPhone] = useState(shop.phone);
  const [saving, setSaving] = useState(false);
  const dirty = name !== shop.name || phone !== shop.phone;
  const typeLabel = SHOP_TYPES.find((t) => t.value === shop.type)?.label;

  async function save() {
    const parsed = shopSeedSchema.safeParse({ name, phone });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the shop details");
      return;
    }
    setSaving(true);
    const result = await updateShopProfile(shop.id, parsed.data);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    toast.success("Shop details updated");
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Your shop</p>
        <Badge variant={shop.status === "live" ? "default" : "secondary"}>
          {shop.status === "live"
            ? shop.isOpen
              ? "Live · Open"
              : "Live · Closed"
            : "Not live yet"}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shop-name">Shop name</Label>
        <Input
          id="shop-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shop-phone">Shop contact number</Label>
        <Input
          id="shop-phone"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Buyers see this to call the shop.
        </p>
      </div>
      <Button className="min-h-11" disabled={!dirty || saving} onClick={save}>
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          "Save shop details"
        )}
      </Button>

      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t pt-3 text-sm">
        {typeLabel && (
          <>
            <dt>Type</dt>
            <dd className="text-foreground">{typeLabel}</dd>
          </>
        )}
        {shop.location?.address && (
          <>
            <dt>
              <MapPin className="inline size-3.5" /> Address
            </dt>
            <dd className="text-foreground">{shop.location.address}</dd>
          </>
        )}
        {shop.hours && (
          <>
            <dt>Hours</dt>
            <dd className="text-foreground">
              {shop.hours.open} – {shop.hours.close}
            </dd>
          </>
        )}
        <dt>Products</dt>
        <dd className="text-foreground">{shop.itemCount}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/settings">
            <Settings className="size-4" /> Hours & status
          </Link>
        </Button>
        {shop.status === "live" && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/shops/${shop.id}`}>
              <ExternalLink className="size-4" /> View public page
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

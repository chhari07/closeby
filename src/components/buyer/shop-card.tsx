import Link from "next/link";
import { Store, Pill, Pencil, Croissant, Cpu, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { NearbyShopResult, ShopType } from "@/types";

const ICONS: Record<ShopType, React.ComponentType<{ className?: string }>> = {
  kirana: Store,
  pharmacy: Pill,
  stationery: Pencil,
  bakery: Croissant,
  electronics: Cpu,
  other: Package,
};

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

export function ShopCard({ shop, distanceInM }: NearbyShopResult) {
  const Icon = ICONS[shop.type];
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/50"
    >
      <div className="bg-accent flex size-12 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{shop.name}</p>
        <p className="text-muted-foreground text-xs">
          {formatDistance(distanceInM)} · {shop.itemCount} items
        </p>
      </div>
      <Badge variant={shop.isOpen ? "default" : "secondary"}>
        {shop.isOpen ? "Open" : "Closed"}
      </Badge>
    </Link>
  );
}

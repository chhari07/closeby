import Link from "next/link";
import { Store, Pill, Pencil, Croissant, Cpu, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { NearbyShopResult, ShopType } from "@/types";

const TINTS: Record<ShopType, string> = {
  kirana: "bg-orange-100 text-orange-700",
  pharmacy: "bg-rose-100 text-rose-700",
  stationery: "bg-indigo-100 text-indigo-700",
  bakery: "bg-amber-100 text-amber-700",
  electronics: "bg-sky-100 text-sky-700",
  other: "bg-emerald-100 text-emerald-700",
};

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
      className="bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${TINTS[shop.type] ?? TINTS.other}`}>
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

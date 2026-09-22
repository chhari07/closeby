"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { findNearbyShops } from "@/actions/buyer";
import { useBuyerLocation, type InitialLocation } from "@/lib/hooks/use-buyer-location";
import { BackButton } from "./back-button";
import { LocationChip } from "./location-chip";
import { LocationPickerDialog } from "./location-picker-dialog";
import { ShopCard } from "./shop-card";
import { ShopListSkeleton } from "./shop-list-skeleton";
import { Input } from "@/components/ui/input";
import { SHOP_TYPES, type Locality, type NearbyShopResult } from "@/types";

export function SearchExplorer({
  initialLocalities,
  initialLocation,
}: {
  initialLocalities: Locality[];
  initialLocation: InitialLocation | null;
}) {
  const { lat, lng, radiusM, gateOpen, setGateOpen, handleGps, handleLocality } =
    useBuyerLocation(initialLocalities, initialLocation);
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState<NearbyShopResult[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!lat || !lng) return;
    setLoading(true);
    findNearbyShops({ lat, lng }, radiusM)
      .then(setAll)
      .finally(() => setLoading(false));
  }, [lat, lng, radiusM]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (r) =>
          r.shop.name.toLowerCase().includes(q) ||
          (SHOP_TYPES.find((t) => t.value === r.shop.type)?.label ?? "").toLowerCase().includes(q)
      )
    : all;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="bg-background sticky top-14 z-30 flex items-center gap-2 border-b p-3">
        <BackButton />
        <LocationChip localities={initialLocalities} />
      </header>

      <div className="p-4">
        <div className="relative mb-4">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            autoFocus
            placeholder="Search shops by name or type"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-9"
          />
        </div>

        {(!lat || !lng) && (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Set your location first to search nearby shops.
          </p>
        )}

        {lat && lng && loading && <ShopListSkeleton />}

        {lat && lng && !loading && filtered.length === 0 && (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {q ? `No shops matching "${query}"${radiusM === 0 ? "" : ` within ${radiusM / 1000} km`}.` : "No open shops nearby right now."}
          </p>
        )}

        {lat && lng && !loading && filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            {filtered.map((r) => (
              <ShopCard key={r.shop.id} {...r} />
            ))}
          </div>
        )}
      </div>

      <LocationPickerDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        localities={initialLocalities}
        onPickGps={handleGps}
        onPickLocality={handleLocality}
      />
    </div>
  );
}

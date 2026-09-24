"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { findNearbyShops, searchNearbyShopsByProduct, type ProductMatchResult } from "@/actions/buyer";
import { useBuyerLocation, type InitialLocation } from "@/lib/hooks/use-buyer-location";
import { BackButton } from "./back-button";
import { LocationChip } from "./location-chip";
import { LocationPickerDialog } from "./location-picker-dialog";
import { ShopCard } from "./shop-card";
import { ShopListSkeleton } from "./shop-list-skeleton";
import { Input } from "@/components/ui/input";
import { SHOP_TYPES, type Locality, type ShopListResult } from "@/types";
import { ANY_DISTANCE } from "@/lib/geo/radius";

/** Debounce before firing the product-alias search — a search box that
 *  hits the server on every keystroke isn't the goal here. */
const SEARCH_DEBOUNCE_MS = 400;

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
  const [all, setAll] = useState<ShopListResult[]>([]);
  const [query, setQuery] = useState("");
  const [productMatches, setProductMatches] = useState<ProductMatchResult[]>([]);

  const canList = (!!lat && !!lng) || radiusM === ANY_DISTANCE;

  useEffect(() => {
    if (!canList) return;
    setLoading(true);
    findNearbyShops(lat && lng ? { lat, lng } : null, radiusM)
      .then(setAll)
      .finally(() => setLoading(false));
  }, [lat, lng, radiusM, canList]);

  // Hindi/Hinglish/English product search (Step 4.1) — a name/type match
  // above is instant (already-loaded shops filtered client-side); a
  // product/alias match needs a bounded server round trip, so it's
  // debounced and kept separate rather than blocking the local filter.
  useEffect(() => {
    if (!lat || !lng || query.trim().length < 2) {
      setProductMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      searchNearbyShopsByProduct({ lat, lng }, radiusM, query).then(setProductMatches);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [lat, lng, radiusM, query]);

  const q = query.trim().toLowerCase();
  const nameMatches = q
    ? all.filter(
        (r) =>
          r.shop.name.toLowerCase().includes(q) ||
          (SHOP_TYPES.find((t) => t.value === r.shop.type)?.label ?? "").toLowerCase().includes(q)
      )
    : all;

  // Merge: a shop matched by name/type keeps that plain result; a shop
  // that matched only by product/alias is added with its matched item
  // shown on the card. De-duped by shop id.
  const seen = new Set(nameMatches.map((r) => r.shop.id));
  const filtered: (ShopListResult & { matchedProductName?: string })[] = [...nameMatches];
  for (const m of productMatches) {
    if (seen.has(m.shop.id)) continue;
    seen.add(m.shop.id);
    filtered.push(m);
  }

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

        {!canList && (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Set your location first to search nearby shops.
          </p>
        )}

        {canList && loading && <ShopListSkeleton />}

        {canList && !loading && filtered.length === 0 && (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {q ? `No shops matching "${query}"${radiusM === 0 ? "" : ` within ${radiusM / 1000} km`}.` : "No open shops nearby right now."}
          </p>
        )}

        {canList && !loading && filtered.length > 0 && (
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

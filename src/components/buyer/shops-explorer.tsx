"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { findNearbyShops } from "@/actions/buyer";
import { useBuyerLocation, type InitialLocation } from "@/lib/hooks/use-buyer-location";
import { LocationChip } from "./location-chip";
import { LocationPickerDialog } from "./location-picker-dialog";
import { ShopCard } from "./shop-card";
import { ShopListSkeleton } from "./shop-list-skeleton";
import { Button } from "@/components/ui/button";
import { ANY_DISTANCE, RADIUS_OPTIONS, radiusLabel } from "@/lib/geo/radius";
import type { Locality, NearbyShopResult } from "@/types";


export function ShopsExplorer({
  initialLocalities,
  initialLocation,
}: {
  initialLocalities: Locality[];
  initialLocation: InitialLocation | null;
}) {
  const { lat, lng, radiusM, setRadius, gateOpen, setGateOpen, handleGps, handleLocality } =
    useBuyerLocation(initialLocalities, initialLocation);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<NearbyShopResult[] | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;
    setLoading(true);
    findNearbyShops({ lat, lng }, radiusM)
      .then(setResults)
      .finally(() => setLoading(false));
  }, [lat, lng, radiusM]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="bg-background sticky top-14 z-30 flex items-center justify-between gap-2 border-b p-3">
        <LocationChip localities={initialLocalities} />
        <Button asChild size="icon" variant="ghost">
          <Link href="/shops/search" aria-label="Search shops">
            <Search className="size-5" />
          </Link>
        </Button>
      </div>

      <div className="p-4">
        {!lat || !lng ? (
          <div className="text-muted-foreground py-16 text-center text-sm">
            <p>We need your location to find shops near you.</p>
            <Button className="mt-4 min-h-11" onClick={() => setGateOpen(true)}>
              Set my location
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadius(r)}
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${
                    radiusM === r ? "border-primary bg-accent" : "border-border"
                  }`}
                >
                  {radiusLabel(r)}
                </button>
              ))}
            </div>

            {loading && <ShopListSkeleton />}

            {!loading && results && results.length === 0 && (
              <div className="text-muted-foreground py-16 text-center text-sm">
                <p>
                  {radiusM === ANY_DISTANCE
                    ? "No open shops right now."
                    : `No open shops within ${radiusM / 1000} km right now.`}
                </p>
                {radiusM !== ANY_DISTANCE && (
                  <Button
                    variant="outline"
                    className="mt-4 min-h-11"
                    onClick={() => setRadius(ANY_DISTANCE)}
                  >
                    Search any distance
                  </Button>
                )}
              </div>
            )}

            {!loading && results && results.length > 0 && (
              <div className="flex flex-col gap-2">
                {results.map((r) => (
                  <ShopCard key={r.shop.id} {...r} />
                ))}
              </div>
            )}
          </>
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

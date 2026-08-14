"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveShopLocation, getMyShop } from "@/actions/shops";
import type { ShopDoc } from "@/types";
import { Loader2 } from "lucide-react";

const LocationPicker = dynamic(
  () => import("@/components/map/location-picker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="bg-muted h-72 w-full animate-pulse rounded-xl" /> }
);

// Guna, MP — sane fallback center when geolocation is denied/unavailable.
const DEFAULT_CENTER = { lat: 24.6466, lng: 77.3122 };

export function StepLocation({
  shopId,
  initial,
  onBack,
  onSaved,
}: {
  shopId: string;
  initial: ShopDoc;
  onBack: () => void;
  onSaved: (shop: ShopDoc) => void;
}) {
  const [position, setPosition] = useState(
    initial.location
      ? { lat: initial.location.lat, lng: initial.location.lng }
      : DEFAULT_CENTER
  );
  const [locating, setLocating] = useState(!initial.location);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initial.location || !navigator.geolocation) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [initial.location]);

  async function handleNext() {
    setSubmitting(true);
    // Only reuse the previously saved address if the pin is still at the
    // exact spot it was saved from — any drag/tap since then means the
    // stored text no longer matches, so send "" and let the server
    // re-resolve it via reverse geocoding for the new coordinates.
    const unchanged =
      initial.location?.lat === position.lat && initial.location?.lng === position.lng;
    const result = await saveShopLocation(shopId, {
      lat: position.lat,
      lng: position.lng,
      address: unchanged ? (initial.location?.address ?? "") : "",
    });
    if (!result.ok) {
      toast.error(result.error ?? "Could not save location");
      setSubmitting(false);
      return;
    }
    const shop = await getMyShop();
    setSubmitting(false);
    if (shop) onSaved(shop);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Drop the pin exactly where buyers should find your shop. Drag it or tap the map to adjust.
      </p>
      {locating ? (
        <div className="bg-muted flex h-72 w-full items-center justify-center gap-2 rounded-xl text-sm">
          <Loader2 className="size-4 animate-spin" /> Finding your location...
        </div>
      ) : (
        <LocationPicker
          lat={position.lat}
          lng={position.lng}
          onChange={(lat, lng) => setPosition({ lat, lng })}
        />
      )}
      <p className="text-muted-foreground text-xs">
        {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
      </p>
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          className="min-h-11 flex-1"
          disabled={submitting || locating}
          onClick={handleNext}
        >
          {submitting ? "Saving..." : "Next"}
        </Button>
      </div>
    </div>
  );
}

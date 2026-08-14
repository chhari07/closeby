"use client";

import { useState } from "react";
import { Loader2, MapPin, LocateFixed } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Locality } from "@/types";

export function LocationPickerDialog({
  open,
  onOpenChange,
  localities,
  onPickGps,
  onPickLocality,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localities: Locality[];
  onPickGps: (lat: number, lng: number) => void;
  onPickLocality: (locality: Locality) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function requestGps() {
    if (!navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onPickGps(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        setError("Location permission was denied. Pick your area below instead.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Where should we search?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 justify-start gap-2"
            onClick={requestGps}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LocateFixed className="size-4" />
            )}
            Use my current location
          </Button>
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div>
            <p className="text-muted-foreground mb-2 text-sm">Or pick your locality</p>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {localities.length === 0 && (
                <p className="text-muted-foreground text-sm">No localities available yet.</p>
              )}
              {localities.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => onPickLocality(loc)}
                  className="hover:bg-accent flex min-h-11 items-center gap-2 rounded-lg px-3 text-left"
                >
                  <MapPin className="text-muted-foreground size-4 shrink-0" />
                  <span className="text-sm">{loc.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

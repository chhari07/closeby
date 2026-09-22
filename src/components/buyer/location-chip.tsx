"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { useLocationStore } from "@/lib/store/location";
import { LocationPickerDialog } from "./location-picker-dialog";
import { saveMyLocation } from "@/actions/buyer";
import { nearestLocality } from "@/lib/geo/geohash";
import type { Locality } from "@/types";

export function LocationChip({ localities }: { localities: Locality[] }) {
  const { localityName, source, lat, lng, setLocation } = useLocationStore();
  const [open, setOpen] = useState(false);

  async function handleGps(newLat: number, newLng: number) {
    const nearest = nearestLocality({ lat: newLat, lng: newLng }, localities);
    setLocation({ lat: newLat, lng: newLng, source: "gps", localityName: nearest?.name });
    await saveMyLocation({ lat: newLat, lng: newLng }, "gps", nearest?.id);
    setOpen(false);
  }

  async function handleLocality(locality: Locality) {
    setLocation({
      lat: locality.center.lat,
      lng: locality.center.lng,
      source: "manual",
      localityId: locality.id,
      localityName: locality.name,
    });
    await saveMyLocation(locality.center, "manual", locality.id);
    setOpen(false);
  }

  const label = lat && lng ? (localityName ?? (source === "gps" ? "Current location" : "Selected area")) : "Set your location";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-accent text-accent-foreground flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm"
      >
        <MapPin className="size-3.5" />
        <span className="max-w-40 truncate">
          Near: {label}
        </span>
        <span className="text-primary-ink underline">change</span>
      </button>
      <LocationPickerDialog
        open={open}
        onOpenChange={setOpen}
        localities={localities}
        onPickGps={handleGps}
        onPickLocality={handleLocality}
      />
    </>
  );
}

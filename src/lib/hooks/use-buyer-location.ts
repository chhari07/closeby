"use client";

import { useEffect, useState } from "react";
import { useLocationStore } from "@/lib/store/location";
import { saveMyLocation } from "@/actions/buyer";
import { nearestLocality } from "@/lib/geo/geohash";
import type { Locality } from "@/types";

export interface InitialLocation {
  lat: number;
  lng: number;
  localityId?: string;
  source: "gps" | "manual";
}

/**
 * Shared location-gate logic for /shops and /shops/search: prefer the
 * persisted store, fall back to the server-known lastKnownLocation, and
 * otherwise prompt (GPS first, locality picker on denial). Keep this the
 * single place buyer pages resolve "where am I searching from".
 */
export function useBuyerLocation(initialLocalities: Locality[], initialLocation: InitialLocation | null) {
  const { lat, lng, radiusM, setLocation, setRadius } = useLocationStore();
  const [gateOpen, setGateOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    setHydrated(true);
    if (lat && lng) return;

    if (initialLocation) {
      const locality = initialLocalities.find((l) => l.id === initialLocation.localityId);
      setLocation({
        lat: initialLocation.lat,
        lng: initialLocation.lng,
        source: initialLocation.source,
        localityId: initialLocation.localityId,
        localityName: locality?.name,
      });
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const nearest = nearestLocality(
            { lat: pos.coords.latitude, lng: pos.coords.longitude },
            initialLocalities
          );
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            source: "gps",
            localityId: nearest?.id,
            localityName: nearest?.name,
          });
          saveMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "gps", nearest?.id);
        },
        () => setGateOpen(true),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setGateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  async function handleGps(newLat: number, newLng: number) {
    const nearest = nearestLocality({ lat: newLat, lng: newLng }, initialLocalities);
    setLocation({ lat: newLat, lng: newLng, source: "gps", localityId: nearest?.id, localityName: nearest?.name });
    await saveMyLocation({ lat: newLat, lng: newLng }, "gps", nearest?.id);
    setGateOpen(false);
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
    setGateOpen(false);
  }

  return { lat, lng, radiusM, setRadius, gateOpen, setGateOpen, handleGps, handleLocality };
}

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LocationState {
  lat: number | null;
  lng: number | null;
  source: "gps" | "manual" | null;
  localityId: string | null;
  localityName: string | null;
  radiusM: number;
  setLocation: (v: {
    lat: number;
    lng: number;
    source: "gps" | "manual";
    localityId?: string | null;
    localityName?: string | null;
  }) => void;
  setRadius: (radiusM: number) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      lat: null,
      lng: null,
      source: null,
      localityId: null,
      localityName: null,
      radiusM: 0, // 0 = any distance (no limit)
      setLocation: ({ lat, lng, source, localityId, localityName }) =>
        set({
          lat,
          lng,
          source,
          localityId: localityId ?? null,
          localityName: localityName ?? null,
        }),
      setRadius: (radiusM) => set({ radiusM }),
    }),
    {
      name: "closeby-location",
      version: 1,
      // v0 defaulted to a 3 km cap; move existing users to "no limit".
      migrate: (state) => ({ ...(state as LocationState), radiusM: 0 }),
    }
  )
);

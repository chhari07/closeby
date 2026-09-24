"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Layers, Loader2, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Leaflet's default marker icon assets don't resolve correctly through
// Next.js's bundler, so we build the icon from CDN URLs directly.
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const STREET_TILES = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};
// Free Esri imagery (no key) — lets an owner spot their actual rooftop.
const SATELLITE_TILES = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  maxZoom: 19,
};
// Street names on top of the satellite photo.
const SATELLITE_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const PHOTON = "https://photon.komoot.io/api/";

interface SearchResult {
  lat: number;
  lng: number;
  label: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

function photonToResult(f: PhotonFeature): SearchResult {
  const p = f.properties;
  const label = [p.name, p.street, p.district, p.city ?? p.county, p.state]
    .filter((part, i, all) => part && all.indexOf(part) === i)
    .join(", ");
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: label || "Unnamed place" };
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Moves the map to the pin when it's set from outside the map (search, GPS). */
function FlyTo({ lat, lng, token }: { lat: number; lng: number; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (token === 0) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 17), { duration: 0.8 });
    // Only on a new external move, not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return null;
}

export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const [initialCenter] = useState<[number, number]>([lat, lng]);
  const [satellite, setSatellite] = useState(false);
  const [flyToken, setFlyToken] = useState(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);

  function moveTo(nextLat: number, nextLng: number) {
    onChange(nextLat, nextLng);
    setFlyToken((t) => t + 1);
  }

  // Address preview for wherever the pin is — debounced so dragging doesn't
  // spam the free geocoder (its policy is ~1 request/second).
  const addressRequest = useRef(0);
  useEffect(() => {
    const id = ++addressRequest.current;
    setAddressLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`, {
          headers: { "Accept-Language": "en" },
        });
        const json = res.ok ? await res.json() : null;
        if (id === addressRequest.current) setAddress(typeof json?.display_name === "string" ? json.display_name : null);
      } catch {
        if (id === addressRequest.current) setAddress(null);
      } finally {
        if (id === addressRequest.current) setAddressLoading(false);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [lat, lng]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    // Two free OpenStreetMap searches: places within ~30 km of the map
    // first (Photon, bounded — local shops/landmarks), then towns and areas
    // anywhere in India (Nominatim). Small-town map data is patchy, so
    // either can come back empty; the pin, GPS and satellite view still work.
    const d = 0.3;
    const [nearby, india] = await Promise.all([
      fetch(`${PHOTON}?limit=6&bbox=${lng - d},${lat - d},${lng + d},${lat + d}&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { features: [] }))
        .then((json: { features: PhotonFeature[] }) => json.features.map(photonToResult))
        .catch(() => [] as SearchResult[]),
      fetch(`${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`, {
        headers: { "Accept-Language": "en" },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((json: { lat: string; lon: string; display_name: string }[]) =>
          json.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name })),
        )
        .catch(() => [] as SearchResult[]),
    ]);
    const seen = new Set<string>();
    setResults(
      [...nearby, ...india].filter((r) => {
        const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
    setSearching(false);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        moveTo(pos.coords.latitude, pos.coords.longitude);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const tiles = satellite ? SATELLITE_TILES : STREET_TILES;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={runSearch} className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setResults(null);
            }}
            placeholder="Search street, area or landmark"
            className="h-11 pl-9"
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 p-1"
              onClick={() => {
                setQuery("");
                setResults(null);
              }}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="outline" className="h-11" disabled={searching || query.trim().length < 3}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
        </Button>

        {results && (
          <ul className="bg-popover absolute top-full right-0 left-0 z-[1000] mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-lg">
            {results.length === 0 ? (
              <li className="text-muted-foreground p-3 text-sm">No places found. Try a nearby landmark.</li>
            ) : (
              results.map((r) => (
                <li key={`${r.lat},${r.lng},${r.label}`}>
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full items-start gap-2 p-3 text-left text-sm"
                    onClick={() => {
                      moveTo(r.lat, r.lng);
                      setResults(null);
                    }}
                  >
                    <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="line-clamp-2">{r.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </form>

      <div className="relative h-80 w-full overflow-hidden rounded-xl border sm:h-96">
        <MapContainer center={initialCenter} zoom={17} maxZoom={19} className="h-full w-full" scrollWheelZoom>
          <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
          {satellite && <TileLayer url={SATELLITE_LABELS} maxZoom={19} />}
          <Marker
            position={[lat, lng]}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const pos = (e.target as L.Marker).getLatLng();
                onChange(pos.lat, pos.lng);
              },
            }}
          />
          <ClickHandler onPick={onChange} />
          <FlyTo lat={lat} lng={lng} token={flyToken} />
        </MapContainer>

        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shadow-md"
            onClick={() => setSatellite((s) => !s)}
          >
            <Layers className="size-4" />
            {satellite ? "Map" : "Satellite"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shadow-md"
            onClick={useMyLocation}
            disabled={locating}
          >
            {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            My location
          </Button>
        </div>
      </div>

      <div className="bg-muted/50 flex items-start gap-2 rounded-lg p-3 text-sm">
        <MapPin className="text-primary mt-0.5 size-4 shrink-0" />
        <span className={addressLoading ? "text-muted-foreground" : ""}>
          {addressLoading ? "Finding address..." : (address ?? "Address not found — the pin location is still saved.")}
        </span>
      </div>
    </div>
  );
}

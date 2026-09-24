"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import {
  findNearbyShops,
  searchNearbyShopsByProduct,
  searchNearbyShopsByTerms,
  type ProductMatchResult,
} from "@/actions/buyer";
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
/** Extra pause before asking the AI — only once the buyer has stopped typing. */
const AI_DEBOUNCE_MS = 700;

type AiSearch =
  | { state: "idle" }
  | { state: "thinking" }
  | { state: "done"; terms: string[] }
  | { state: "unavailable" };

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
  const [ai, setAi] = useState<AiSearch>({ state: "idle" });
  /** Ignore answers to queries the buyer has since changed. */
  const latestQuery = useRef("");

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
  //
  // Step 4.1, AI part: only when the plain search (whole query, then its
  // words) finds nothing, and no shop name matches either, the AI is asked
  // what the buyer meant ("kuch thanda peene ko" -> cold drink, juice…);
  // its answer is cached server-side, so a repeated query costs nothing.
  useEffect(() => {
    latestQuery.current = query;
    setAi({ state: "idle" });
    if (!lat || !lng || query.trim().length < 2) {
      setProductMatches([]);
      return;
    }
    const origin = { lat, lng };
    const current = query;
    const stale = () => latestQuery.current !== current;
    let aiTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(async () => {
      const plain = await searchNearbyShopsByProduct(origin, radiusM, current).catch(() => []);
      if (stale()) return;
      setProductMatches(plain);
      const needle = current.trim().toLowerCase();
      const nameHit = all.some((r) => r.shop.name.toLowerCase().includes(needle));
      if (plain.length > 0 || nameHit || needle.length < 3) return;

      aiTimer = setTimeout(async () => {
        if (stale()) return;
        setAi({ state: "thinking" });
        try {
          const res = await fetch("/api/ai/searchQuery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: current }),
          });
          const body: { data?: { terms: string[] } } = await res.json().catch(() => ({}));
          if (stale()) return;
          if (!res.ok || !body.data) {
            setAi({ state: "unavailable" });
            return;
          }
          const terms = body.data.terms;
          const matches = terms.length ? await searchNearbyShopsByTerms(origin, radiusM, terms) : [];
          if (stale()) return;
          setProductMatches(matches);
          setAi({ state: "done", terms });
        } catch {
          if (!stale()) setAi({ state: "unavailable" });
        }
      }, AI_DEBOUNCE_MS);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      if (aiTimer) clearTimeout(aiTimer);
    };
    // `all` is read for the name check only; re-running on it would re-search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            placeholder="Search shops or products — Hindi, Hinglish or English"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-9"
          />
        </div>

        {ai.state === "thinking" && (
          <p className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Understanding your search…
          </p>
        )}
        {ai.state === "done" && ai.terms.length > 0 && (
          <p className="bg-primary/5 text-foreground mb-3 flex flex-wrap items-center gap-1.5 rounded-lg px-3 py-2 text-sm">
            <Sparkles className="text-primary size-4" /> Showing results for:
            {ai.terms.map((t) => (
              <span key={t} className="bg-background rounded-full border px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </p>
        )}

        {!canList && (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Set your location first to search nearby shops.
          </p>
        )}

        {canList && loading && <ShopListSkeleton />}

        {canList && !loading && filtered.length === 0 && (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {ai.state === "thinking"
              ? ""
              : q
                ? `No shops matching "${query}"${radiusM === 0 ? "" : ` within ${radiusM / 1000} km`}.${
                    ai.state === "done" && ai.terms.length === 0 ? " That doesn't look like something shops sell — try a product name." : ""
                  }`
                : "No open shops nearby right now."}
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

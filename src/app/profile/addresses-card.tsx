"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, LocateFixed, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { addSavedAddress, deleteSavedAddress } from "@/actions/users";
import type { SavedAddress } from "@/types";

const BLANK = { label: "Home", line1: "", landmark: "", lat: 0, lng: 0 };

/** Buyer's saved delivery addresses — the same list checkout picks from. */
export function AddressesCard({ initial }: { initial: SavedAddress[] }) {
  const [addresses, setAddresses] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function pinLocation() {
    if (!navigator.geolocation) {
      toast.error("Location isn't available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft((d) => ({
          ...d,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function save() {
    if (!draft.line1.trim()) {
      toast.error("Enter your address");
      return;
    }
    setSaving(true);
    const result = await addSavedAddress(draft);
    setSaving(false);
    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Could not save address");
      return;
    }
    setAddresses((prev) => [...prev, result.data!.address]);
    setDraft(BLANK);
    setAdding(false);
    toast.success("Address saved");
  }

  async function remove(id: string) {
    setRemovingId(id);
    const result = await deleteSavedAddress(id);
    setRemovingId(null);
    if (!result.ok) {
      toast.error(result.error ?? "Could not remove address");
      return;
    }
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">Saved addresses</p>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add
          </Button>
        )}
      </div>

      {addresses.length === 0 && !adding && (
        <p className="text-muted-foreground text-sm">No saved addresses yet.</p>
      )}

      {addresses.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-2 rounded-lg border p-3"
        >
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{a.label}</p>
            <p className="text-muted-foreground text-xs">
              {a.line1}
              {a.landmark ? `, ${a.landmark}` : ""}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${a.label}`}
            disabled={removingId === a.id}
            onClick={() => remove(a.id)}
          >
            {removingId === a.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        </div>
      ))}

      {adding && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-label">Label</Label>
            <Input
              id="addr-label"
              value={draft.label}
              placeholder="Home, Work..."
              onChange={(e) =>
                setDraft((d) => ({ ...d, label: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-line1">Address</Label>
            <Input
              id="addr-line1"
              value={draft.line1}
              placeholder="House no, street, area"
              onChange={(e) =>
                setDraft((d) => ({ ...d, line1: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="addr-landmark">Landmark (optional)</Label>
            <Input
              id="addr-landmark"
              value={draft.landmark}
              onChange={(e) =>
                setDraft((d) => ({ ...d, landmark: e.target.value }))
              }
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={pinLocation}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LocateFixed className="size-4" />
            )}
            Use my current location
          </Button>
          {draft.lat !== 0 && (
            <p className="text-muted-foreground text-xs">
              Pinned at {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setAdding(false);
                setDraft(BLANK);
              }}
            >
              Cancel
            </Button>
            <Button className="flex-1" disabled={saving} onClick={save}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save address"
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

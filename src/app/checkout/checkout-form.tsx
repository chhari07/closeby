"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LocateFixed, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { BackButton } from "@/components/buyer/back-button";
import { useCartStore } from "@/lib/store/cart";
import { formatPaise } from "@/lib/money";
import { placeOrder } from "@/actions/orders";
import { addSavedAddress } from "@/actions/users";
import { payForOrder } from "@/lib/payments/checkout";
import { Bilingual } from "@/components/bilingual";
import type { SavedAddress, PaymentMethod } from "@/types";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "online", label: "Pay online (UPI / card)" },
  { value: "cod", label: "Cash on delivery" },
  { value: "pay_at_shop", label: "Pay at shop" },
];

export function CheckoutForm({
  savedAddresses,
  onlinePayment = false,
}: {
  savedAddresses: SavedAddress[];
  /** Razorpay keys are set on the server — offer "Pay online". */
  onlinePayment?: boolean;
}) {
  const router = useRouter();
  const { shopId, shopName, items, removeItems, updateItemPrice, updateQty, clear } = useCartStore();
  // Set once the order is placed so clearing the cart doesn't bounce to /cart.
  const placed = useRef(false);
  const [addresses, setAddresses] = useState(savedAddresses);
  const [selectedId, setSelectedId] = useState<string | null>(savedAddresses[0]?.id ?? null);
  const [addingNew, setAddingNew] = useState(savedAddresses.length === 0);
  const [newAddr, setNewAddr] = useState({ label: "Home", line1: "", landmark: "", lat: 0, lng: 0 });
  const [locating, setLocating] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("cod");
  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewAddr((a) => ({ ...a, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function handleSaveNewAddress(): Promise<SavedAddress | null> {
    if (!newAddr.line1.trim()) {
      toast.error("Enter your address");
      return null;
    }
    const result = await addSavedAddress(newAddr);
    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Could not save address");
      return null;
    }
    setAddresses((prev) => [...prev, result.data!.address]);
    setSelectedId(result.data.address.id);
    setAddingNew(false);
    return result.data.address;
  }

  async function handlePlaceOrder() {
    if (!shopId || items.length === 0) return;

    let address = addresses.find((a) => a.id === selectedId) ?? null;
    if (addingNew || !address) {
      address = await handleSaveNewAddress();
      if (!address) return;
    }

    setSubmitting(true);
    const result = await placeOrder({
      shopId,
      items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
      deliveryAddress: {
        line1: address.line1,
        landmark: address.landmark,
        lat: address.lat,
        lng: address.lng,
      },
      paymentMethod: payment,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error ?? "Could not place order");
      if (result.rejection?.removedProductIds?.length) {
        removeItems(result.rejection.removedProductIds);
      }
      for (const limit of result.rejection?.stockLimits ?? []) {
        updateQty(limit.productId, limit.available);
      }
      if (result.rejection?.priceChanges?.length) {
        for (const change of result.rejection.priceChanges) {
          updateItemPrice(change.productId, change.newPrice);
        }
      }
      return;
    }

    const { orderId, payment: session } = result.data!;
    placed.current = true;
    clear(); // the order exists and its stock is held, paid or not yet

    if (session) {
      setSubmitting(true);
      const outcome = await payForOrder(orderId, session);
      setSubmitting(false);
      if (outcome.status === "paid") toast.success("Payment successful — your order is placed!");
      else if (outcome.status === "failed") toast.error(outcome.error);
      else toast.info("Payment not completed. You can pay from the order page within 15 minutes.");
    }
    router.push(`/orders/${orderId}`);
  }

  useEffect(() => {
    if (!placed.current && (!shopId || items.length === 0)) router.replace("/cart");
  }, [shopId, items.length, router]);

  if (!shopId || items.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto max-w-lg pb-28">
      <header className="border-b p-4">
        <BackButton />
        <h1 className="mt-1 text-xl font-bold">Checkout</h1>
        <p className="text-muted-foreground text-sm">{shopName}</p>
      </header>

      <div className="flex flex-col gap-6 p-4">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Delivery address</h2>
          <div className="flex flex-col gap-2">
            {addresses.map((addr) => (
              <button
                key={addr.id}
                type="button"
                onClick={() => {
                  setSelectedId(addr.id);
                  setAddingNew(false);
                }}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left ${
                  selectedId === addr.id && !addingNew ? "border-primary bg-accent" : "border-border"
                }`}
              >
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{addr.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {addr.line1}
                    {addr.landmark ? `, ${addr.landmark}` : ""}
                  </p>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                addingNew ? "border-primary bg-accent" : "border-border"
              }`}
            >
              <Plus className="size-4" /> Add new address
            </button>
          </div>

          {addingNew && (
            <Card className="mt-3 flex flex-col gap-3 p-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={newAddr.label}
                  onChange={(e) => setNewAddr((a) => ({ ...a, label: e.target.value }))}
                  placeholder="Home, Work..."
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="line1">Address</Label>
                <Input
                  id="line1"
                  value={newAddr.line1}
                  onChange={(e) => setNewAddr((a) => ({ ...a, line1: e.target.value }))}
                  placeholder="House no, street, area"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="landmark">Landmark (optional)</Label>
                <Input
                  id="landmark"
                  value={newAddr.landmark}
                  onChange={(e) => setNewAddr((a) => ({ ...a, landmark: e.target.value }))}
                />
              </div>
              <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
                {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
                Use my current location
              </Button>
              {newAddr.lat !== 0 && (
                <p className="text-muted-foreground text-xs">
                  Pinned at {newAddr.lat.toFixed(5)}, {newAddr.lng.toFixed(5)}
                </p>
              )}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Payment method</h2>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_OPTIONS.filter((o) => o.value !== "online" || onlinePayment).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPayment(option.value)}
                className={`min-h-11 flex-1 basis-[30%] rounded-lg border px-3 text-sm leading-tight ${
                  payment === option.value ? "border-primary bg-accent" : "border-border"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Order summary</h2>
          <div className="flex flex-col gap-1 text-sm">
            {items.map((i) => (
              <div key={i.productId} className="flex justify-between">
                <span className="text-muted-foreground">
                  {i.name} × {i.qty}
                </span>
                <span>{formatPaise(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span>{formatPaise(total)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background p-4 sm:bottom-0">
        <Button
          size="lg"
          className="mx-auto min-h-11 w-full max-w-lg"
          disabled={submitting}
          onClick={handlePlaceOrder}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Bilingual k="placeOrder" /> · {formatPaise(total)}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

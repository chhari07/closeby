"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Package, Plus, Trash2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/buyer/back-button";
import { useCartStore } from "@/lib/store/cart";
import { formatPaise } from "@/lib/money";

export function CartView() {
  const router = useRouter();
  const { shopId, shopName, items, updateQty, removeItem } = useCartStore();
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  if (!shopId || items.length === 0) {
    return (
      <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <ShoppingCart className="text-muted-foreground size-10" />
        <p className="font-medium">Your cart is empty</p>
        <p className="text-muted-foreground text-sm">Browse nearby shops to add items.</p>
        <Button asChild className="mt-2 min-h-11">
          <Link href="/shops">Browse shops</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-28">
      <header className="border-b p-4">
        <BackButton />
        <h1 className="mt-1 text-xl font-bold">Your cart</h1>
        <p className="text-muted-foreground text-sm">{shopName}</p>
      </header>

      <div className="flex flex-col divide-y p-4">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center gap-3 py-3">
            <div className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <Package className="text-muted-foreground size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {formatPaise(item.price)} · {item.unit}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={() => updateQty(item.productId, item.qty - 1)}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-4 text-center text-sm">{item.qty}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                aria-label="Increase quantity"
                disabled={item.qty >= 50}
                onClick={() => updateQty(item.productId, item.qty + 1)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => removeItem(item.productId)}
              aria-label="Remove"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background p-4 sm:bottom-0">
        <div className="mx-auto flex max-w-lg items-center justify-between pb-2">
          <span className="text-muted-foreground text-sm">Total</span>
          <span className="text-lg font-semibold">{formatPaise(total)}</span>
        </div>
        <Button size="lg" className="min-h-11 w-full" onClick={() => router.push("/checkout")}>
          Proceed to checkout
        </Button>
      </div>
    </div>
  );
}

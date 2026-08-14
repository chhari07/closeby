"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus, Minus, ShoppingCart } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/store/cart";
import { formatPaise } from "@/lib/money";
import { Bilingual } from "@/components/bilingual";
import type { ProductDoc, ShopDoc } from "@/types";

export function ProductCatalog({ shop, products }: { shop: ShopDoc; products: ProductDoc[] }) {
  const { shopId, items, addItem, updateQty, pendingSwitch, confirmSwitch, cancelSwitch } =
    useCartStore();

  const grouped = products.reduce<Record<string, ProductDoc[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  const cartTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = items.reduce((sum, i) => sum + i.qty, 0);
  const cartBelongsHere = shopId === shop.id;

  function qtyFor(productId: string) {
    return cartBelongsHere ? items.find((i) => i.productId === productId)?.qty ?? 0 : 0;
  }

  function handleAdd(product: ProductDoc) {
    addItem(shop.id, shop.name, {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      price: product.price,
      qty: 1,
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {products.length === 0 && (
        <p className="text-muted-foreground py-10 text-center text-sm">
          This shop hasn&apos;t added any products yet.
        </p>
      )}

      {Object.entries(grouped).map(([category, categoryProducts]) => (
        <div key={category}>
          <h2 className="mb-2 text-sm font-semibold">{category}</h2>
          <div className="flex flex-col divide-y rounded-lg border">
            {categoryProducts.map((product) => {
              const qty = qtyFor(product.id);
              const disabled = !product.inStock || !shop.isOpen;
              return (
                <div key={product.id} className="flex items-center gap-3 p-3">
                  <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md">
                    {product.imageUrl && (
                      <Image src={product.imageUrl} alt={product.name} fill className="object-cover" />
                    )}
                  </div>
                  <div className={`min-w-0 flex-1 ${disabled ? "opacity-50" : ""}`}>
                    <p className="truncate font-medium">{product.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatPaise(product.price)} · {product.unit}
                    </p>
                    {!product.inStock && (
                      <p className="text-destructive text-xs">Out of stock</p>
                    )}
                  </div>
                  {qty === 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => handleAdd(product)}
                      className="text-xs"
                    >
                      <Bilingual k="addToCart" />
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => updateQty(product.id, qty - 1)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-4 text-center text-sm">{qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        disabled={disabled}
                        onClick={() => handleAdd(product)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {cartBelongsHere && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background p-3 sm:bottom-0">
          <Button asChild size="lg" className="min-h-11 w-full justify-between">
            <Link href="/cart">
              <span className="flex items-center gap-2">
                <ShoppingCart className="size-4" /> {cartCount} item{cartCount > 1 ? "s" : ""}
              </span>
              <span>{formatPaise(cartTotal)}</span>
            </Link>
          </Button>
        </div>
      )}

      <AlertDialog open={!!pendingSwitch} onOpenChange={(open) => !open && cancelSwitch()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new cart?</AlertDialogTitle>
            <AlertDialogDescription>
              Your cart has items from another shop. Clear it and start a new cart from{" "}
              {pendingSwitch?.shopName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelSwitch}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch}>Clear and add</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

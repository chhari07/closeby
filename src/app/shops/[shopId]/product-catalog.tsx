"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Minus, ShoppingCart, Search, SlidersHorizontal, X } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductImage } from "@/components/product-image";
import { useCartStore } from "@/lib/store/cart";
import { formatPaise } from "@/lib/money";
import { Bilingual } from "@/components/bilingual";
import { cn } from "@/lib/utils";
import type { ProductDoc, ShopDoc } from "@/types";

type SortKey = "featured" | "price-asc" | "price-desc" | "discount" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
  { value: "name", label: "Name A–Z" },
];

// Rupee bands, in paise. `max: null` means "and above".
const PRICE_BANDS: { label: string; min: number; max: number | null }[] = [
  { label: "Any price", min: 0, max: null },
  { label: "Under ₹50", min: 0, max: 5000 },
  { label: "₹50 – ₹200", min: 5000, max: 20000 },
  { label: "₹200 – ₹500", min: 20000, max: 50000 },
  { label: "Over ₹500", min: 50000, max: null },
];

const ALL = "All";

function discountPct(p: ProductDoc): number {
  return p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
}

export function ProductCatalog({ shop, products }: { shop: ShopDoc; products: ProductDoc[] }) {
  const { shopId, items, addItem, updateQty, pendingSwitch, confirmSwitch, cancelSwitch } =
    useCartStore();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("featured");
  const [bandIdx, setBandIdx] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<ProductDoc | null>(null);

  const cartTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = items.reduce((sum, i) => sum + i.qty, 0);
  const cartBelongsHere = shopId === shop.id;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const band = PRICE_BANDS[bandIdx]!;
    const list = products.filter((p) => {
      if (category !== ALL && p.category !== category) return false;
      if (inStockOnly && !p.inStock) return false;
      if (p.price < band.min || (band.max !== null && p.price >= band.max)) return false;
      if (!q) return true;
      return [p.name, p.brand, p.category, p.description]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
    const sorted = [...list];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "discount":
        sorted.sort((a, b) => discountPct(b) - discountPct(a));
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // Featured: in-stock first, keep the owner's (recently updated) order.
        sorted.sort((a, b) => Number(b.inStock) - Number(a.inStock));
    }
    return sorted;
  }, [products, query, category, sort, bandIdx, inStockOnly]);

  const filtersActive = bandIdx !== 0 || inStockOnly || category !== ALL || query !== "";

  function clearFilters() {
    setQuery("");
    setCategory(ALL);
    setBandIdx(0);
    setInStockOnly(false);
    setSort("featured");
  }

  function qtyFor(productId: string) {
    return cartBelongsHere ? (items.find((i) => i.productId === productId)?.qty ?? 0) : 0;
  }

  function handleAdd(product: ProductDoc) {
    addItem(shop.id, shop.name, {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      price: product.price,
      qty: 1,
      imageUrl: product.imageUrl ?? null,
    });
  }

  function cartControl(product: ProductDoc, size: "sm" | "lg" = "sm") {
    const qty = qtyFor(product.id);
    const disabled = !product.inStock || !shop.isOpen;
    if (qty === 0) {
      return (
        <Button
          size={size === "lg" ? "lg" : "sm"}
          variant={size === "lg" ? "default" : "outline"}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            handleAdd(product);
          }}
          className={cn("w-full text-xs", size === "lg" && "min-h-11 text-sm")}
        >
          {!product.inStock ? <Bilingual k="outOfStock" /> : <Bilingual k="addToCart" />}
        </Button>
      );
    }
    return (
      <div
        className="flex w-full items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="Decrease quantity"
          onClick={() => updateQty(product.id, qty - 1)}
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="text-sm font-medium">{qty}</span>
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="Increase quantity"
          disabled={disabled || qty >= Math.min(product.stock, 50)}
          onClick={() => handleAdd(product)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    );
  }

  const filterPanel = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Price</p>
        <div className="flex flex-col gap-1">
          {PRICE_BANDS.map((b, i) => (
            <label key={b.label} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="price-band"
                checked={bandIdx === i}
                onChange={() => setBandIdx(i)}
              />
              {b.label}
            </label>
          ))}
        </div>
      </div>
      <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
        In stock only
      </label>
      {filtersActive && (
        <Button variant="ghost" size="sm" className="justify-start" onClick={clearFilters}>
          <X className="size-3.5" /> Clear all
        </Button>
      )}
    </div>
  );

  return (
    <div className="p-4">
      {/* Toolbar: search + sort + mobile filter toggle */}
      <div className="bg-background sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b px-4 pb-3 pt-1">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search in ${shop.name}`}
              aria-label="Search products"
              className="h-10 pl-8"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort products"
            className="border-input bg-background h-10 rounded-lg border px-2 text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            className="h-10 lg:hidden"
            aria-label="Filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>

        {/* Mobile category chips */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {[[ALL, products.length] as const, ...categories].map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                category === name ? "bg-primary text-primary-foreground border-primary" : "bg-background"
              )}
            >
              {name} <span className="opacity-70">{count}</span>
            </button>
          ))}
        </div>
        {filtersOpen && <div className="rounded-lg border p-3 lg:hidden">{filterPanel}</div>}
      </div>

      <div className="mt-4 flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-24 flex flex-col gap-6">
            <div>
              <p className="mb-2 text-sm font-semibold">Categories</p>
              <ul className="flex flex-col">
                {[[ALL, products.length] as const, ...categories].map(([name, count]) => (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => setCategory(name)}
                      className={cn(
                        "hover:bg-muted flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm",
                        category === name && "bg-accent font-medium"
                      )}
                    >
                      <span>{name}</span>
                      <span className="text-muted-foreground text-xs">{count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {filterPanel}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground mb-3 text-sm">
            {visible.length} {visible.length === 1 ? "product" : "products"}
            {category !== ALL && ` in ${category}`}
          </p>

          {products.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              This shop hasn&apos;t added any products yet.
            </p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-muted-foreground text-sm">No products match your filters.</p>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => {
                const pct = discountPct(product);
                return (
                  <article
                    key={product.id}
                    onClick={() => setDetail(product)}
                    className="bg-card group flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                  >
                    <div className="relative">
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.name}
                        className={cn("aspect-square w-full", !product.inStock && "opacity-50 grayscale")}
                      />
                      {pct > 0 && product.inStock && (
                        <span className="bg-status-ready absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white">
                          {pct}% OFF
                        </span>
                      )}
                      {!product.inStock && (
                        <span className="bg-foreground/80 text-background absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium">
                          Out of stock
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      {product.brand && (
                        <p className="text-muted-foreground truncate text-[11px] uppercase tracking-wide">
                          {product.brand}
                        </p>
                      )}
                      <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>
                      <p className="text-muted-foreground text-xs">{product.unit}</p>
                      <div className="mt-auto flex items-baseline gap-1.5 pt-1">
                        <span className="font-semibold">{formatPaise(product.price)}</span>
                        {pct > 0 && (
                          <span className="text-muted-foreground text-xs line-through">
                            {formatPaise(product.mrp!)}
                          </span>
                        )}
                      </div>
                      <div className="pt-1">{cartControl(product)}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Product detail */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{detail.name}</DialogTitle>
              </DialogHeader>
              <ProductImage
                src={detail.imageUrl}
                alt={detail.name}
                className="aspect-square w-full rounded-xl"
              />
              <div className="flex flex-col gap-2">
                {detail.brand && (
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">{detail.brand}</p>
                )}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{formatPaise(detail.price)}</span>
                  {discountPct(detail) > 0 && (
                    <>
                      <span className="text-muted-foreground line-through">{formatPaise(detail.mrp!)}</span>
                      <span className="text-status-ready text-sm font-semibold">
                        {discountPct(detail)}% off
                      </span>
                    </>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {detail.unit} · {detail.category}
                </p>
                <p className={cn("text-sm font-medium", detail.inStock ? "text-status-ready" : "text-destructive")}>
                  {detail.inStock
                    ? detail.stock <= 5
                      ? `Only ${detail.stock} left`
                      : "In stock"
                    : "Out of stock"}
                </p>
                {detail.description && <p className="text-sm leading-relaxed">{detail.description}</p>}
              </div>
              {cartControl(detail, "lg")}
            </>
          )}
        </DialogContent>
      </Dialog>

      {cartBelongsHere && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background p-3 sm:bottom-0">
          <Button asChild size="lg" className="mx-auto min-h-11 w-full max-w-6xl justify-between">
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

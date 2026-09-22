"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Loader2, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductImage } from "@/components/product-image";
import { ProductFormDialog } from "@/app/dashboard/inventory/product-form-dialog";
import { JsonImportDialog } from "@/app/dashboard/inventory/json-import-dialog";
import { deleteProduct, getShopProducts } from "@/actions/products";
import { goLiveShop } from "@/actions/shops";
import { formatPaise } from "@/lib/money";
import type { ProductDoc } from "@/types";

const MIN_PRODUCTS = 3;

export function StepInventory({ shopId, onBack }: { shopId: string; onBack: () => void }) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [goingLive, setGoingLive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Resume: show whatever was already added if the owner left and came back.
  useEffect(() => {
    let cancelled = false;
    getShopProducts(shopId)
      .then((list) => !cancelled && setProducts(list))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  async function onRemove(productId: string) {
    const result = await deleteProduct(shopId, productId);
    if (!result.ok) {
      toast.error(result.error ?? "Could not remove product");
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  }

  async function handleGoLive() {
    setGoingLive(true);
    const result = await goLiveShop(shopId);
    if (!result.ok) {
      setGoingLive(false);
      toast.error(result.error ?? "Could not go live");
      return;
    }
    toast.success("Your shop is live!");
    setGoingLive(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        Add at least {MIN_PRODUCTS} products to go live — one by one with a photo, or import a JSON /
        CSV file together with your product photos. You can edit prices and stock anytime from your
        dashboard.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add a product
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" /> Import file + photos
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {loading && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            <Loader2 className="mx-auto size-4 animate-spin" />
          </p>
        )}
        {!loading && products.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">No products added yet.</p>
        )}
        {products.map((p) => (
          <Card key={p.id} className="flex flex-row items-center gap-3 p-3">
            <ProductImage src={p.imageUrl} alt={p.name} className="size-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-muted-foreground text-xs">
                {formatPaise(p.price)} · {p.unit} · {p.category} · stock {p.stock}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onRemove(p.id)}
              aria-label="Remove product"
            >
              <Trash2 className="size-4" />
            </Button>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          className="min-h-11 flex-1"
          disabled={products.length < MIN_PRODUCTS || goingLive}
          onClick={handleGoLive}
        >
          {goingLive ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            `Go live (${Math.min(products.length, MIN_PRODUCTS)}/${MIN_PRODUCTS})`
          )}
        </Button>
      </div>

      <ProductFormDialog
        shopId={shopId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={(product) => {
          setProducts((prev) => [product, ...prev]);
          setAddOpen(false);
        }}
      />
      <JsonImportDialog
        shopId={shopId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(added) => setProducts((prev) => [...added, ...prev])}
      />
    </div>
  );
}

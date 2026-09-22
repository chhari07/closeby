"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import type { ProductDoc } from "@/types";
import { formatPaise } from "@/lib/money";
import { ProductImage } from "@/components/product-image";
import {
  deleteProduct,
  setProductStock,
  bulkSetInStock,
} from "@/actions/products";
import { ProductFormDialog } from "./product-form-dialog";
import { JsonImportDialog } from "./json-import-dialog";
import { AiStockDialog } from "./ai-stock-dialog";

export function InventoryTable({
  shopId,
  initialProducts,
}: {
  shopId: string;
  initialProducts: ProductDoc[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProductDoc | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProductDoc | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleStockChange(product: ProductDoc, stock: number) {
    if (Number.isNaN(stock) || stock < 0) return;
    setBusyId(product.id);
    const result = await setProductStock(shopId, product.id, stock);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error ?? "Could not update stock");
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id ? { ...p, stock, inStock: stock > 0 } : p,
      ),
    );
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const result = await deleteProduct(shopId, pendingDelete.id);
    if (!result.ok) {
      toast.error(result.error ?? "Could not delete product");
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== pendingDelete.id));
    setPendingDelete(null);
  }

  async function handleBulk(inStock: boolean) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const result = await bulkSetInStock(shopId, ids, inStock);
    if (!result.ok) {
      toast.error(result.error ?? "Bulk update failed");
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        ids.includes(p.id)
          ? { ...p, inStock, stock: inStock ? (p.stock > 0 ? p.stock : 1) : 0 }
          : p,
      ),
    );
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {products.length} products
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-9"
            onClick={() => setImporting(true)}
          >
            <Upload className="size-4" /> Import JSON / CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-9"
            onClick={() => setAiImporting(true)}
          >
            <Sparkles className="size-4" /> Voice / text update
          </Button>
          <Button size="sm" className="min-h-9" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add product
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-accent flex items-center justify-between rounded-lg p-2 px-3">
          <span className="text-sm">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulk(true)}
            >
              Mark in stock
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulk(false)}
            >
              Mark out of stock
            </Button>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          No products yet. Add your first product to get started.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={() => toggleSelect(p.id)}
              />
              <ProductImage
                src={p.imageUrl}
                alt={p.name}
                className="size-12 shrink-0 rounded-md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-muted-foreground text-xs">
                  {p.brand ? `${p.brand} · ` : ""}
                  {formatPaise(p.price)}
                  {p.mrp && p.mrp > p.price
                    ? ` (MRP ${formatPaise(p.mrp)})`
                    : ""}{" "}
                  · {p.unit} · {p.category}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  defaultValue={p.stock}
                  className="h-9 w-16 text-center"
                  disabled={busyId === p.id}
                  onBlur={(e) => handleStockChange(p, Number(e.target.value))}
                />
                {busyId === p.id && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
              </div>
              <Badge
                variant={p.inStock ? "default" : "secondary"}
                className="shrink-0"
              >
                {p.inStock ? "In stock" : "Out of stock"}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditing(p)}
                aria-label="Edit"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setPendingDelete(p)}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ProductFormDialog
        shopId={shopId}
        open={adding}
        onOpenChange={setAdding}
        onSaved={(p) => setProducts((prev) => [p, ...prev])}
      />
      <JsonImportDialog
        shopId={shopId}
        open={importing}
        onOpenChange={setImporting}
        onImported={(imported) => setProducts((prev) => [...imported, ...prev])}
      />
      <AiStockDialog
        shopId={shopId}
        open={aiImporting}
        onOpenChange={setAiImporting}
        onImported={(imported) => setProducts((prev) => [...imported, ...prev])}
      />
      <ProductFormDialog
        shopId={shopId}
        product={editing}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(p) => {
          setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
          setEditing(null);
        }}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from your catalog. Past orders that included this
              item are unaffected — order line items are frozen at the time they
              were placed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

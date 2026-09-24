"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Download, ImagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bulkImportProducts, bulkSetProductImages } from "@/actions/products";
import { uploadProductImage } from "@/lib/supabase/upload";
import { csvToProducts } from "@/lib/inventory/csv";
import type { ProductDoc } from "@/types";

const JSON_SAMPLE = `[
  {
    "name": "Amul Milk", "brand": "Amul", "price": 28, "mrp": 30,
    "unit": "500 ml", "category": "Dairy", "stock": 20,
    "imageUrl": "https://example.com/milk.jpg",
    "description": "Fresh toned milk",
    "aliases": ["doodh", "dudh"]
  }
]`;

const CSV_SAMPLE = `name,brand,category,unit,price,mrp,stock,imageUrl,description,aliases
Amul Milk,Amul,Dairy,500 ml,28,30,20,https://example.com/milk.jpg,Fresh toned milk,"doodh; dudh"`;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Run async work over items with a small concurrency cap. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** Import products from a .json or .csv file (the dialog keeps its original name for the existing import). */
export function JsonImportDialog({
  shopId,
  open,
  onOpenChange,
  onImported,
}: {
  shopId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (products: ProductDoc[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<File[]>([]);

  function reset() {
    setFileName(null);
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imagesInputRef.current) imagesInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    const isCsv =
      file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";

    let parsed: unknown;
    if (isCsv) {
      parsed = csvToProducts(text);
    } else {
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error("That file isn't valid JSON");
        reset();
        return;
      }
    }

    // Rows whose imageUrl is a bare filename (e.g. "milk.jpg") are matched to
    // the photos picked below, uploaded after the import, then linked.
    const byName = new Map(images.map((f) => [f.name.toLowerCase(), f]));
    const pending = new Map<number, File>();
    const unmatched = new Set<string>();
    if (Array.isArray(parsed)) {
      parsed = parsed.map((row, i) => {
        if (!row || typeof row !== "object") return row;
        const url = (row as { imageUrl?: unknown }).imageUrl;
        if (typeof url !== "string") return row;
        const v = url.trim();
        if (!v || /^https?:\/\//i.test(v) || v.startsWith("/")) return row;
        const photo = byName.get((v.split(/[\\/]/).pop() ?? v).toLowerCase());
        if (
          photo &&
          photo.type.startsWith("image/") &&
          photo.size <= MAX_IMAGE_BYTES
        ) {
          pending.set(i, photo);
        } else {
          unmatched.add(v);
        }
        const { imageUrl: _drop, ...rest } = row as Record<string, unknown>;
        void _drop;
        return rest;
      });
    }

    setImporting(true);
    const result = await bulkImportProducts(shopId, parsed);

    if (!result.ok || !result.data) {
      setImporting(false);
      toast.error(result.error ?? "Import failed");
      reset();
      return;
    }

    const { products, failed } = result.data;

    // Products come back in file order minus failed rows, so map them to
    // their original row index to find each one's photo.
    const failedIdx = new Set(failed.map((f) => f.index));
    const rowIndexes: number[] = [];
    for (let i = 0; rowIndexes.length < products.length; i++)
      if (!failedIdx.has(i)) rowIndexes.push(i);

    let withImages = products;
    if (pending.size > 0) {
      const jobs = products
        .map((p, k) => ({ p, photo: pending.get(rowIndexes[k]!) }))
        .filter((j): j is { p: ProductDoc; photo: File } => !!j.photo);
      const uploaded = await mapLimit(jobs, 4, async ({ p, photo }) => {
        try {
          return {
            productId: p.id,
            imageUrl: await uploadProductImage(shopId, p.id, photo),
          };
        } catch {
          return null;
        }
      });
      const ok = uploaded.filter(
        (u): u is { productId: string; imageUrl: string } => !!u,
      );
      if (ok.length > 0) {
        await bulkSetProductImages(shopId, ok);
        const urls = new Map(ok.map((u) => [u.productId, u.imageUrl]));
        withImages = products.map((p) =>
          urls.has(p.id) ? { ...p, imageUrl: urls.get(p.id)! } : p,
        );
      }
      if (ok.length < jobs.length)
        toast.warning(`${jobs.length - ok.length} photo(s) failed to upload`);
    }
    setImporting(false);
    if (unmatched.size > 0) {
      toast.warning(
        `No photo picked for: ${[...unmatched].slice(0, 3).join(", ")}${unmatched.size > 3 ? "…" : ""}`,
      );
    }

    if (products.length > 0) {
      onImported(withImages);
      toast.success(
        failed.length > 0
          ? `Added ${products.length} products, ${failed.length} skipped`
          : `Added ${products.length} products`,
      );
    }
    if (failed.length > 0) {
      const preview = failed
        .slice(0, 3)
        .map((f) => `Row ${f.index + 1}: ${f.error}`)
        .join("\n");
      toast.warning(
        `Some rows were skipped:\n${preview}${failed.length > 3 ? "\n…" : ""}`,
      );
    }

    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import products (JSON or CSV)</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Upload a <b>.json</b> or <b>.csv</b> file, up to 200 products at a
            time. Prices are in rupees. Required:{" "}
            <code>name, price, unit, category</code>. Optional:{" "}
            <code>stock, brand, mrp, description, imageUrl, aliases</code> —
            imageUrl is an https link, a /path, or the <b>file name</b> of a
            photo you pick below (e.g. <code>milk.jpg</code>); aliases are
            other names buyers might search for (semicolon/comma separated in
            CSV, a list in JSON).
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium">JSON</p>
              <pre className="bg-muted overflow-x-auto rounded-lg p-2 text-[11px]">
                {JSON_SAMPLE}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">CSV</p>
              <pre className="bg-muted overflow-x-auto rounded-lg p-2 text-[11px]">
                {CSV_SAMPLE}
              </pre>
            </div>
          </div>

          <div className="bg-accent flex flex-col gap-2 rounded-lg p-3">
            <p className="text-sm font-medium">Ready-made sample catalog</p>
            <p className="text-muted-foreground text-xs">
              50 items across kirana, pharmacy, stationery, bakery, electronics
              and general stores — with images. Download, trim to what you sell,
              then import.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a href="/inventory-samples/electronics.csv" download>
                  <Download className="size-4" /> Electronics CSV
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="/inventory-samples/electronics.json" download>
                  <Download className="size-4" /> Electronics JSON
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="/inventory-samples/inventory.json" download>
                  <Download className="size-4" /> Sample JSON
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="/inventory-samples/inventory.csv" download>
                  <Download className="size-4" /> Sample CSV
                </a>
              </Button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <input
            ref={imagesInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => setImages(Array.from(e.target.files ?? []))}
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={importing}
            onClick={() => imagesInputRef.current?.click()}
          >
            <ImagePlus className="size-4" />{" "}
            {images.length
              ? `${images.length} photo(s) selected`
              : "Add product photos (optional)"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Upload className="size-4" />{" "}
                {fileName ?? "Choose JSON or CSV file"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

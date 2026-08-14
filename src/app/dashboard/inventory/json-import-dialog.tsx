"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bulkImportProducts } from "@/actions/products";
import type { ProductDoc } from "@/types";

const SAMPLE = `[
  { "name": "Amul Milk", "price": 28, "unit": "500 ml", "category": "Dairy", "stock": 20 },
  { "name": "Parle-G", "price": 10, "unit": "1 pack", "category": "Biscuits", "stock": 50 }
]`;

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

  function reset() {
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    const text = await file.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error("That file isn't valid JSON");
      reset();
      return;
    }

    setImporting(true);
    const result = await bulkImportProducts(shopId, parsed);
    setImporting(false);

    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Import failed");
      return;
    }

    const { products, failed } = result.data;
    if (products.length > 0) {
      onImported(products);
      toast.success(
        failed.length > 0
          ? `Added ${products.length} products, ${failed.length} skipped`
          : `Added ${products.length} products`
      );
    }
    if (failed.length > 0) {
      const preview = failed
        .slice(0, 3)
        .map((f) => `Row ${f.index + 1}: ${f.error}`)
        .join("\n");
      toast.warning(`Some rows were skipped:\n${preview}${failed.length > 3 ? "\n…" : ""}`);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import products from JSON</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Upload a JSON file with an array of products. Prices are in rupees, same as the manual
            form. You can add products this way and manually — both work on the same catalog.
          </p>
          <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">{SAMPLE}</pre>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
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
                <Upload className="size-4" /> {fileName ?? "Choose JSON file"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProductDoc } from "@/types";
import { addProduct, updateProduct } from "@/actions/products";
import { uploadProductImage } from "@/lib/firebase/upload";
import { rupeesToPaise } from "@/lib/money";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  price: z.number().positive("Enter a price"),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  category: z.string().trim().min(1, "Category is required").max(40),
  stock: z.number().int().min(0),
  brand: z.string().trim().max(60),
  mrp: z.number().nonnegative().nullable(),
  description: z.string().trim().max(500),
  // Comma-separated in the form, an array in the database (Step 1.10) —
  // Hindi/Hinglish alternate names so search finds "chawal" as well as "rice".
  aliases: z.string().trim().max(200),
  imageUrl: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^https?:\/\//i.test(v) || v.startsWith("/"),
      "Use an https link",
    ),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY_VALUES: FormValues = {
  name: "",
  price: 0,
  unit: "",
  category: "",
  stock: 0,
  brand: "",
  mrp: null,
  description: "",
  imageUrl: "",
  aliases: "",
};

/** "chawal, chaval" -> ["chawal", "chaval"], capped and cleaned. */
function parseAliases(raw: string): string[] | undefined {
  const list = raw
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 10);
  return list.length ? list : undefined;
}

// Empty number inputs come through as NaN; treat them as "not set".
const optionalNumber = (v: unknown) =>
  v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);

export function ProductFormDialog({
  shopId,
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  shopId: string;
  product?: ProductDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (product: ProductDoc) => void;
}) {
  const isEdit = !!product;
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (open) {
      reset(
        product
          ? {
              name: product.name,
              price: product.price / 100,
              unit: product.unit,
              category: product.category,
              stock: product.stock,
              brand: product.brand ?? "",
              mrp: product.mrp ? product.mrp / 100 : null,
              description: product.description ?? "",
              imageUrl: product.imageUrl ?? "",
              aliases: product.aliases?.join(", ") ?? "",
            }
          : EMPTY_VALUES,
      );
      setFile(null);
    }
  }, [open, product, reset]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const price = rupeesToPaise(values.price);
    const mrp =
      values.mrp && values.mrp > values.price
        ? rupeesToPaise(values.mrp)
        : undefined;
    const { imageUrl: linkedImage, mrp: _mrp, aliases: _aliases, ...rest } = values;
    void _mrp;
    void _aliases;
    const details = {
      ...rest,
      price,
      brand: values.brand || undefined,
      description: values.description || undefined,
      mrp,
      aliases: parseAliases(values.aliases),
    };

    if (isEdit && product) {
      const result = await updateProduct(shopId, product.id, {
        ...details,
        imageUrl: linkedImage || product.imageUrl || null,
      });
      let imageUrl = linkedImage || product.imageUrl;
      if (file) {
        try {
          imageUrl = await uploadProductImage(shopId, product.id, file);
          await updateProduct(shopId, product.id, { imageUrl });
        } catch {
          toast.error("Image upload failed, other changes were saved");
        }
      }
      setSubmitting(false);
      if (!result.ok) {
        toast.error(result.error ?? "Could not save");
        return;
      }
      onSaved({
        ...product,
        ...details,
        imageUrl: imageUrl ?? null,
        inStock: values.stock > 0,
      });
      return;
    }

    const result = await addProduct(shopId, {
      ...details,
      imageUrl: linkedImage || null,
    });
    if (!result.ok || !result.data) {
      setSubmitting(false);
      toast.error(result.error ?? "Could not add product");
      return;
    }

    let imageUrl: string | null = linkedImage || null;
    if (file) {
      try {
        imageUrl = await uploadProductImage(
          shopId,
          result.data.productId,
          file,
        );
        await updateProduct(shopId, result.data.productId, { imageUrl });
      } catch {
        toast.error("Product added, but image upload failed");
      }
    }
    setSubmitting(false);
    onSaved({
      id: result.data.productId,
      shopId,
      ...details,
      imageUrl,
      inStock: values.stock > 0,
      updatedAt: Date.now(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-name">Name</Label>
            <Input id="pf-name" {...register("name")} />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-price">Price (₹)</Label>
              <Input
                id="pf-price"
                type="number"
                step="0.01"
                min={0}
                {...register("price", { valueAsNumber: true })}
              />
              {errors.price && (
                <p className="text-destructive text-sm">
                  {errors.price.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-unit">Unit</Label>
              <Input id="pf-unit" placeholder="1 kg" {...register("unit")} />
              {errors.unit && (
                <p className="text-destructive text-sm">
                  {errors.unit.message}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-category">Category</Label>
              <Input id="pf-category" {...register("category")} />
              {errors.category && (
                <p className="text-destructive text-sm">
                  {errors.category.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-stock">Stock</Label>
              <Input
                id="pf-stock"
                type="number"
                min={0}
                {...register("stock", { valueAsNumber: true })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-brand">Brand (optional)</Label>
              <Input id="pf-brand" {...register("brand")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-mrp">MRP ₹ (optional)</Label>
              <Input
                id="pf-mrp"
                type="number"
                step="0.01"
                min={0}
                placeholder="Shown struck-through"
                {...register("mrp", { setValueAs: optionalNumber })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-desc">Description (optional)</Label>
            <Textarea id="pf-desc" rows={2} {...register("description")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-aliases">Other names (optional)</Label>
            <Input
              id="pf-aliases"
              placeholder="e.g. chawal, chaval"
              {...register("aliases")}
            />
            <p className="text-muted-foreground text-xs">
              Comma-separated Hindi/Hinglish names buyers might search for instead.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-image-url">Image link (optional)</Label>
            <Input
              id="pf-image-url"
              placeholder="https://…"
              {...register("imageUrl")}
            />
            {errors.imageUrl && (
              <p className="text-destructive text-sm">
                {errors.imageUrl.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-image">Or upload a photo</Label>
            <Input
              id="pf-image"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="min-h-11 w-full"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

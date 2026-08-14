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
});
type FormValues = z.infer<typeof formSchema>;

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
    defaultValues: { name: "", price: 0, unit: "", category: "", stock: 0 },
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
            }
          : { name: "", price: 0, unit: "", category: "", stock: 0 }
      );
      setFile(null);
    }
  }, [open, product, reset]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const price = rupeesToPaise(values.price);

    if (isEdit && product) {
      const result = await updateProduct(shopId, product.id, { ...values, price });
      let imageUrl = product.imageUrl;
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
      onSaved({ ...product, ...values, price, imageUrl: imageUrl ?? null, inStock: values.stock > 0 });
      return;
    }

    const result = await addProduct(shopId, { ...values, price, imageUrl: null });
    if (!result.ok || !result.data) {
      setSubmitting(false);
      toast.error(result.error ?? "Could not add product");
      return;
    }

    let imageUrl: string | null = null;
    if (file) {
      try {
        imageUrl = await uploadProductImage(shopId, result.data.productId, file);
        await updateProduct(shopId, result.data.productId, { imageUrl });
      } catch {
        toast.error("Product added, but image upload failed");
      }
    }
    setSubmitting(false);
    onSaved({
      id: result.data.productId,
      shopId,
      ...values,
      price,
      imageUrl,
      inStock: values.stock > 0,
      updatedAt: Date.now(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-name">Name</Label>
            <Input id="pf-name" {...register("name")} />
            {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-price">Price (₹)</Label>
              <Input id="pf-price" type="number" step="0.01" min={0} {...register("price", { valueAsNumber: true })} />
              {errors.price && <p className="text-destructive text-sm">{errors.price.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-unit">Unit</Label>
              <Input id="pf-unit" placeholder="1 kg" {...register("unit")} />
              {errors.unit && <p className="text-destructive text-sm">{errors.unit.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-category">Category</Label>
              <Input id="pf-category" {...register("category")} />
              {errors.category && <p className="text-destructive text-sm">{errors.category.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-stock">Stock</Label>
              <Input id="pf-stock" type="number" min={0} {...register("stock", { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-image">Photo (optional)</Label>
            <Input
              id="pf-image"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="min-h-11 w-full">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

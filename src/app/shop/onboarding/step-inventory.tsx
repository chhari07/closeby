"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import type { ProductInput } from "@/lib/validation/product";
import { addProduct, deleteProduct } from "@/actions/products";
import { goLiveShop } from "@/actions/shops";
import { formatPaise, rupeesToPaise } from "@/lib/money";

interface ProductRow {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: string;
  stock: number;
}

// Form collects price in rupees (decimal), converted to integer paise on
// submit — productSchema (paise) is enforced server-side in addProduct().
const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  price: z.number().positive("Enter a price"),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  category: z.string().trim().min(1, "Category is required").max(40),
  stock: z.number().int().min(0),
});

export function StepInventory({ shopId, onBack }: { shopId: string; onBack: () => void }) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [goingLive, setGoingLive] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", price: 0, unit: "", category: "", stock: 0 },
  });

  async function onAdd(values: { name: string; price: number; unit: string; category: string; stock: number }) {
    setSubmitting(true);
    const input: ProductInput = { ...values, imageUrl: null };
    const result = await addProduct(shopId, input);
    setSubmitting(false);
    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Could not add product");
      return;
    }
    setProducts((prev) => [...prev, { id: result.data!.productId, ...values }]);
    reset({ name: "", price: 0, unit: "", category: "", stock: 0 });
  }

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
        Add at least 3 products to go live. You can add more, edit prices and stock anytime from
        your dashboard.
      </p>

      <form
        onSubmit={handleSubmit((v) => onAdd({ ...v, price: rupeesToPaise(v.price) }))}
        className="grid grid-cols-2 gap-3 sm:grid-cols-6"
      >
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Amul Milk" {...register("name")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="price">Price (₹)</Label>
          <Input id="price" type="number" step="0.01" min={0} {...register("price", { valueAsNumber: true })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" placeholder="1 L" {...register("unit")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="category">Category</Label>
          <Input id="category" placeholder="Dairy" {...register("category")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="stock">Stock</Label>
          <Input id="stock" type="number" min={0} {...register("stock", { valueAsNumber: true })} />
        </div>
        <div className="col-span-2 sm:col-span-6">
          <Button type="submit" variant="secondary" className="min-h-11 w-full" disabled={submitting}>
            {submitting ? "Adding..." : "Add product"}
          </Button>
          {Object.values(errors)[0] && (
            <p className="text-destructive mt-1 text-sm">
              {Object.values(errors)[0]?.message as string}
            </p>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {products.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">No products added yet.</p>
        )}
        {products.map((p) => (
          <Card key={p.id} className="flex flex-row items-center justify-between gap-3 p-3">
            <div className="min-w-0">
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
          disabled={products.length < 3 || goingLive}
          onClick={handleGoLive}
        >
          {goingLive ? <Loader2 className="size-4 animate-spin" /> : `Go live (${products.length}/3)`}
        </Button>
      </div>
    </div>
  );
}

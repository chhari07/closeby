"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { shopDetailsStepSchema } from "@/lib/validation/shop";
import { saveShopDetails, getMyShop } from "@/actions/shops";
import type { ShopDoc } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type FormValues = z.infer<typeof shopDetailsStepSchema>;

export function StepDetails({
  shopId,
  initial,
  onBack,
  onSaved,
}: {
  shopId: string;
  initial: ShopDoc;
  onBack: () => void;
  onSaved: (shop: ShopDoc) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(shopDetailsStepSchema),
    defaultValues: {
      name: initial.name ?? "",
      phone: initial.phone ?? "",
      open: initial.hours?.open ?? "09:00",
      close: initial.hours?.close ?? "21:00",
      days: initial.hours?.days ?? [0, 1, 2, 3, 4, 5, 6],
    },
  });

  const days = watch("days");

  function toggleDay(d: number) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    setValue("days", next, { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const result = await saveShopDetails(shopId, values);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      setSubmitting(false);
      return;
    }
    const shop = await getMyShop();
    setSubmitting(false);
    if (shop) onSaved(shop);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Shop name</Label>
        <Input id="name" placeholder="e.g. Sharma Kirana Store" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Shop phone number</Label>
        <Input id="phone" inputMode="numeric" placeholder="9876543210" {...register("phone")} />
        {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="open">Opens at</Label>
          <Input id="open" type="time" {...register("open")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="close">Closes at</Label>
          <Input id="close" type="time" {...register("close")} />
        </div>
      </div>
      {errors.close && <p className="text-sm text-destructive">{errors.close.message}</p>}
      <div className="flex flex-col gap-1.5">
        <Label>Working days</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label
              key={d}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 ${
                days.includes(i) ? "border-primary bg-accent" : "border-border"
              }`}
            >
              <Checkbox checked={days.includes(i)} onCheckedChange={() => toggleDay(i)} />
              <span className="text-sm">{d}</span>
            </label>
          ))}
        </div>
        {errors.days && <p className="text-sm text-destructive">{errors.days.message}</p>}
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="min-h-11 flex-1" disabled={submitting}>
          {submitting ? "Saving..." : "Next"}
        </Button>
      </div>
    </form>
  );
}

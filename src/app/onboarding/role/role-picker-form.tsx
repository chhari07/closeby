"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Store, ShoppingBag } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { completeOnboardingSchema } from "@/lib/validation/user";
import { completeOnboarding } from "@/actions/users";
import { toast } from "sonner";

const formSchema = completeOnboardingSchema;
type FormValues = z.infer<typeof formSchema>;

export function RolePickerForm() {
  const router = useRouter();
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { role: undefined, name: user?.fullName ?? "", phone: "" },
  });

  const role = watch("role");

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const result = await completeOnboarding(values);
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error ?? "Something went wrong");
      return;
    }
    await user?.reload();
    setSubmitting(false);
    router.push(values.role === "shop_owner" ? "/shop/onboarding" : "/shops");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome to CloseBy</h1>
        <p className="text-muted-foreground mt-1">
          Tell us how you&apos;ll use CloseBy. This can&apos;t be changed later.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setValue("role", "buyer", { shouldValidate: true })}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 min-h-[44px] transition-colors ${
            role === "buyer" ? "border-primary bg-accent" : "border-border"
          }`}
        >
          <ShoppingBag className="size-7" />
          <span className="font-medium">I&apos;m a Buyer</span>
        </button>
        <button
          type="button"
          onClick={() => setValue("role", "shop_owner", { shouldValidate: true })}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 min-h-[44px] transition-colors ${
            role === "shop_owner" ? "border-primary bg-accent" : "border-border"
          }`}
        >
          <Store className="size-7" />
          <span className="font-medium">I own a Shop</span>
        </button>
      </div>

      <Card className="p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" placeholder="e.g. Aman Kumar" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" inputMode="numeric" placeholder="9876543210" {...register("phone")} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          {errors.role && <p className="text-sm text-destructive">Pick a role above</p>}
          <Button type="submit" size="lg" disabled={submitting} className="min-h-11">
            {submitting ? "Saving..." : "Continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

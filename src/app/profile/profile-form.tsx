"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useClerk } from "@clerk/nextjs";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validation/user";
import { updateProfile } from "@/actions/users";
import type { UserDoc } from "@/types";

export function ProfileForm({ me }: { me: UserDoc & { id: string } }) {
  const { signOut } = useClerk();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: me.name, phone: me.phone },
  });

  async function onSubmit(values: UpdateProfileInput) {
    setSubmitting(true);
    const result = await updateProfile(values);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    toast.success("Profile updated");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">Account type</p>
          <Badge variant="secondary">{me.role === "shop_owner" ? "Shop owner" : "Buyer"}</Badge>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" inputMode="numeric" {...register("phone")} />
            {errors.phone && <p className="text-destructive text-sm">{errors.phone.message}</p>}
          </div>
          <Button type="submit" className="min-h-11" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
          </Button>
        </form>
      </Card>

      <Button variant="outline" className="min-h-11" onClick={() => signOut({ redirectUrl: "/" })}>
        <LogOut className="size-4" /> Logout
      </Button>
    </div>
  );
}

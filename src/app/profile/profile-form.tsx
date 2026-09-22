"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useClerk } from "@clerk/nextjs";
import { LogOut, Loader2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validation/user";
import { updateProfile } from "@/actions/users";
import type { Role } from "@/types";

interface ProfileMe {
  name: string;
  phone: string;
  role: Role;
  createdAt: number;
}

export function ProfileForm({ me, email }: { me: ProfileMe; email: string }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: me.name, phone: me.phone },
  });

  const initials =
    me.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  const since = me.createdAt
    ? new Date(me.createdAt).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      })
    : null;

  async function onSubmit(values: UpdateProfileInput) {
    setSubmitting(true);
    const result = await updateProfile(values);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    reset(values); // clears the dirty state so Save disables again
    toast.success("Profile updated");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center gap-4 p-4">
        <div className="bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-bold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{me.name}</p>
          {email && (
            <p className="text-muted-foreground truncate text-sm">{email}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">
              {me.role === "shop_owner" ? "Shop owner" : "Buyer"}
            </Badge>
            {since && (
              <span className="text-muted-foreground text-xs">
                Since {since}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <p className="font-medium">Your details</p>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" {...register("name")} />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} readOnly disabled />
            <p className="text-muted-foreground text-xs">
              Your email is used to sign in.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Mobile number</Label>
            <Input
              id="phone"
              inputMode="numeric"
              autoComplete="tel-national"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="text-destructive text-sm">{errors.phone.message}</p>
            )}
          </div>
          <Button
            type="submit"
            className="min-h-11"
            disabled={submitting || !isDirty}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Save changes"
            )}
          </Button>
        </form>
      </Card>

      {me.role === "buyer" && (
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/orders">
            <ClipboardList className="size-4" /> My orders
          </Link>
        </Button>
      )}

      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => signOut({ redirectUrl: "/" })}
      >
        <LogOut className="size-4" /> Logout
      </Button>
    </div>
  );
}

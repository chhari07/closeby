"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Firestore's daily free quota ran out ("8 RESOURCE_EXHAUSTED: Quota
  // exceeded"). Retrying can't help until it resets, so say so plainly.
  // (Production builds hide server error text, so this shows in dev and for
  // client-side errors; production falls back to the generic message.)
  const overQuota = /RESOURCE_EXHAUSTED|quota exceeded/i.test(error.message ?? "");
  if (overQuota) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="size-10 text-amber-500" />
        <div className="max-w-sm">
          <h1 className="text-lg font-bold">CloseBy is resting for a bit</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            We&apos;ve hit today&apos;s database limit. Everything is safe and nothing was lost — it comes back
            automatically when the limit resets (around 12:30 PM IST).
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={reset}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="text-destructive size-10" />
      <div>
        <h1 className="text-lg font-bold">Something went wrong</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Please try again. If this keeps happening, check your connection.
        </p>
      </div>
      <Button className="min-h-11" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

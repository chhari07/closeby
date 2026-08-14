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

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-muted-foreground max-w-sm">
        This page doesn&apos;t exist, or isn&apos;t available to you.
      </p>
      <Button asChild className="min-h-11">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}

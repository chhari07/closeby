"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-runs the page's server data on an interval (only while the tab is visible). */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () =>
      document.visibilityState === "visible" && router.refresh();
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);
  return null;
}

"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-status-stopped text-white fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 py-2 text-sm">
      <WifiOff className="size-4" /> You&apos;re offline — some things won&apos;t update until you&apos;re back online.
    </div>
  );
}

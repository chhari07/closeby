"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { heartbeat } from "@/actions/presence";

const EVERY_MS = 60_000;

/**
 * Tells the server "this person has CloseBy open" once a minute (even in a
 * background tab — its alerts still reach them there), and "they left" the
 * moment the tab closes. The server emails alerts only when they're away.
 */
export function PresenceHeartbeat() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    const beat = () => void heartbeat().catch(() => {});
    beat();
    const timer = setInterval(beat, EVERY_MS);
    const onShow = () => document.visibilityState === "visible" && beat();
    const onLeave = () => navigator.sendBeacon?.("/api/presence/away");
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [isSignedIn]);

  return null;
}

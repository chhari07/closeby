"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * Keeps the Firebase Auth session in sync with the Clerk session so
 * client-side onSnapshot listeners (order status, incoming orders) run
 * with request.auth.uid == Clerk userId, matching firestore.rules.
 */
export function FirebaseAuthSync() {
  const { isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (!isFirebaseConfigured) {
      console.warn("Firebase keys missing: copy .env.local.example to .env.local and fill them in.");
      return;
    }
    let cancelled = false;

    async function sync() {
      const firebaseAuth = getFirebaseAuth();
      if (!isSignedIn || !userId) {
        await signOut(firebaseAuth).catch(() => {});
        return;
      }
      if (firebaseAuth.currentUser?.uid === userId) return;

      const res = await fetch("/api/firebase-token");
      if (!res.ok) return;
      const { token } = await res.json();
      if (!cancelled && token) {
        await signInWithCustomToken(firebaseAuth, token).catch(() => {});
      }
    }

    sync();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

  return null;
}

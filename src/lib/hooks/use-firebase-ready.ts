"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * True once the Firebase Auth session (minted from the Clerk session by
 * FirebaseAuthSync) is active for the current user. Firestore listeners must
 * wait for this: attached earlier they run unauthenticated, get
 * permission-denied, and Firestore never retries a failed listener.
 */
export function useFirebaseReady(): boolean {
  const { userId } = useAuth();
  const [readyUid, setReadyUid] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (user) => setReadyUid(user?.uid ?? null));
  }, []);

  return !!userId && readyUid === userId;
}

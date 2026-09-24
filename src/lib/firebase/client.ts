"use client";

import { initializeApp, getApps, getApp, type FirebaseOptions, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Set by `npm run dev:emu` (scripts/dev-emulator.sh): talk to the local
 * Firebase emulators instead of the real project. Never set in production.
 */
const useEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
const EMULATOR_HOST = "127.0.0.1";

/** False until the NEXT_PUBLIC_FIREBASE_* keys are set in .env.local. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Lazy on purpose: this module is pulled in by client components that also
// render on the server during prerendering, where real Firebase env vars
// may not be configured yet (e.g. local dev before keys are added, or CI).
let app: FirebaseApp | undefined;
let _db: Firestore | undefined;
let _storage: FirebaseStorage | undefined;
let _auth: Auth | undefined;

function getFirebaseApp(): FirebaseApp {
  app ??= getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getFirebaseApp());
    if (useEmulator) connectFirestoreEmulator(_db, EMULATOR_HOST, 8080);
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(getFirebaseApp());
    if (useEmulator) connectStorageEmulator(_storage, EMULATOR_HOST, 9199);
  }
  return _storage;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    if (useEmulator) connectAuthEmulator(_auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  }
  return _auth;
}

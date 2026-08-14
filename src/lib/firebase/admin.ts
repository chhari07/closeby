import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

let app: App | undefined;

// Lazy on purpose: importing this module (e.g. transitively, during `next build`
// page-data collection) must not require real credentials to be present.
// Only the first actual server request pays the init cost.
function getAdminApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in .env.local"
    );
  }

  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  return app;
}

let _db: Firestore | undefined;
let _auth: Auth | undefined;
let _storage: Storage | undefined;

export function adminDb(): Firestore {
  _db ??= getFirestore(getAdminApp());
  return _db;
}

export function adminAuth(): Auth {
  _auth ??= getAuth(getAdminApp());
  return _auth;
}

export function adminStorage(): Storage {
  _storage ??= getStorage(getAdminApp());
  return _storage;
}

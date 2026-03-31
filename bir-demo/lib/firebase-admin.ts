import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

let app: App | null = null;

/**
 * Firebase Admin is optional for local smoke tests without credentials.
 * When env is incomplete, returns null and API routes skip Storage/Firestore.
 */
export function getFirebaseAdmin(): App | null {
  if (app) return app;
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${projectId}.appspot.com`;
  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket,
  });
  return app;
}

export function getAdminFirestore(): Firestore | null {
  const a = getFirebaseAdmin();
  if (!a) return null;
  return getFirestore(a);
}

export function getAdminStorage(): Storage | null {
  const a = getFirebaseAdmin();
  if (!a) return null;
  return getStorage(a);
}

export const BIR_RUNS_COLLECTION = "birRuns";

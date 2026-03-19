/**
 * firebaseAdmin.ts
 * Server-side Firebase Admin SDK.
 * Used in server.ts to write parsed schedule data to Firestore.
 *
 * Setup:
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" → download JSON
 *   3. Save as firebase-service-account.json in project root (already in .gitignore)
 *   4. Add FIREBASE_SERVICE_ACCOUNT_PATH to your .env
 */

import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";
import firebaseConfig from "../firebase-applet-config.json";

let adminApp: App;
let adminDb: Firestore;

function initAdmin(): { app: App; db: Firestore } {
  if (getApps().length > 0) {
    return { app: getApps()[0], db: getFirestore(getApps()[0]) };
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountPath) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH not set in .env. " +
      "Download your service account key from Firebase Console → Project Settings → Service Accounts."
    );
  }

  const serviceAccount = JSON.parse(
    readFileSync(resolve(process.cwd(), serviceAccountPath), "utf-8")
  );

  adminApp = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`,
  });

  adminDb = getFirestore(adminApp);

  // Use the same named database as the client
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  }

  console.log("Firebase Admin SDK initialised.");
  return { app: adminApp, db: adminDb };
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    const { db } = initAdmin();
    return db;
  }
  return adminDb;
}

/**
 * Write a parsed XER schedule to Firestore.
 *
 * Data structure:
 *   /clients/{clientId}/projects/{projectId}/
 *     - schedule (document with project info + metrics)
 *     - activities (subcollection, one doc per activity)
 *     - relationships (subcollection, one doc per relationship)
 */
export async function writeScheduleToFirestore(
  clientId: string,
  projectId: string,
  scheduleDoc: Record<string, any>,
  activities: any[],
  relationships: any[]
): Promise<void> {
  const db = getAdminDb();
  const batch = db.batch();

  // Main schedule document
  const scheduleRef = db
    .collection("clients")
    .doc(clientId)
    .collection("projects")
    .doc(projectId);

  batch.set(scheduleRef, {
    ...scheduleDoc,
    lastUpdated: new Date().toISOString(),
  });

  await batch.commit();

  // Activities — write in chunks of 400 (Firestore batch limit is 500)
  const CHUNK = 400;
  for (let i = 0; i < activities.length; i += CHUNK) {
    const chunk = activities.slice(i, i + CHUNK);
    const actBatch = db.batch();
    for (const activity of chunk) {
      const ref = scheduleRef.collection("activities").doc(activity.id);
      actBatch.set(ref, activity);
    }
    await actBatch.commit();
  }

  // Relationships — write in chunks
  for (let i = 0; i < relationships.length; i += CHUNK) {
    const chunk = relationships.slice(i, i + CHUNK);
    const relBatch = db.batch();
    chunk.forEach((rel, idx) => {
      const ref = scheduleRef.collection("relationships").doc(`rel_${i + idx}`);
      relBatch.set(ref, rel);
    });
    await relBatch.commit();
  }

  console.log(
    `Wrote ${activities.length} activities and ${relationships.length} relationships ` +
    `to clients/${clientId}/projects/${projectId}`
  );
}

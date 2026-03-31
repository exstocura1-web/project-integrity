import { BIR_RUNS_COLLECTION, getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json({ error: "Persistence not configured" }, { status: 503 });
  }
  const snap = await db.collection(BIR_RUNS_COLLECTION).doc(runId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const d = snap.data();
  return NextResponse.json({
    runId,
    fileName: d?.fileName,
    findings: d?.findings,
    scenario: d?.scenario,
  });
}

import { randomUUID } from "crypto";
import { parseScheduleFile, runBirAnalysis, type ScenarioTag } from "@/lib/bir";
import { BIR_RUNS_COLLECTION, getAdminFirestore, getAdminStorage } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

function scenarioOf(raw: string | null): ScenarioTag {
  if (raw === "baseline" || raw === "current" || raw === "other") return raw;
  return "current";
}

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 15 MB demo)." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  const scenarioRaw = form.get("scenario");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 15 MB demo)." }, { status: 413 });
  }
  const name = file.name || "schedule";
  const low = name.toLowerCase();
  if (!low.endsWith(".xer") && !low.endsWith(".csv")) {
    return NextResponse.json(
      { error: "Use .xer or .csv for this demo." },
      { status: 400 },
    );
  }

  const model = await parseScheduleFile(buf, name);
  const scenario = scenarioOf(typeof scenarioRaw === "string" ? scenarioRaw : null);
  const findings = runBirAnalysis(model, scenario);
  const runId = randomUUID();

  const db = getAdminFirestore();
  const storage = getAdminStorage();

  let storagePath: string | undefined;
  let persisted = false;

  if (db && storage) {
    try {
      const bucket = storage.bucket();
      storagePath = `bir-demo/uploads/${runId}/${encodeURIComponent(name)}`;
      const ref = bucket.file(storagePath);
      await ref.save(buf, {
        metadata: {
          contentType: file.type || "application/octet-stream",
        },
      });
      await db.collection(BIR_RUNS_COLLECTION).doc(runId).set({
        runId,
        fileName: name,
        byteLength: buf.length,
        scenario,
        findings,
        storagePath,
        createdAt: Timestamp.now(),
      });
      persisted = true;
    } catch (e) {
      console.error("Firebase persist error", e);
      /* still return findings */
    }
  }

  return NextResponse.json({ runId, findings, persisted });
}

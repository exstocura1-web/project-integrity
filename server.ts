import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { createHash, randomUUID } from "crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import axios from "axios";
import multer from "multer";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { parseXer } from "./src/services/xerParser.js";
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL } from "./src/config/anthropicModel.js";
import { buildBirPrompt, buildTriageImpactPrompt } from "./src/prompts/methodologyPrompts.js";

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT_EXCEPTION", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED_REJECTION", reason);
});

// Firebase Admin (server-side Firestore writes + optional Storage)
// Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env
// Optional: FIREBASE_STORAGE_BUCKET (defaults to <PROJECT_ID>.appspot.com)
let adminDb: ReturnType<typeof getFirestore> | null = null;
let adminBucket: ReturnType<ReturnType<typeof getStorage>["bucket"]> | null = null;
try {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    });
  }
  adminDb = getFirestore();
  const pid = process.env.FIREBASE_PROJECT_ID;
  if (pid) {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${pid}.appspot.com`;
    adminBucket = getStorage().bucket(bucketName);
  }
  console.log("Firebase Admin initialised");
} catch (e) {
  console.warn("Firebase Admin not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env");
}

/** Always allowed together with FRONTEND_URL when CORS is restricted (split deploy). */
const EXTRA_FRONTEND_ORIGINS = [
  "https://projectintegrity.cloud",
  "https://www.projectintegrity.cloud",
] as const;

function expressCorsOrigin(
  primary: string,
): boolean | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  if (!primary) return true;
  const allow = new Set<string>([primary, ...EXTRA_FRONTEND_ORIGINS]);
  return (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    cb(null, allow.has(origin));
  };
}

function socketIoCorsOrigin(primary: string): boolean | string[] {
  if (!primary) return true;
  return Array.from(new Set([primary, ...EXTRA_FRONTEND_ORIGINS]));
}

async function startServer() {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_URL?.trim() || "";
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: socketIoCorsOrigin(frontendOrigin),
      credentials: true,
    }
  });
  const PORT = Number(process.env.PORT || 3000);

  const MAX_UPLOAD_BYTES = 52 * 1024 * 1024; // PRD: 52 MB cap
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, cb) => {
      const ext = file.originalname.split(".").pop()?.toLowerCase();
      if (ext === "xer" || ext === "csv") return cb(null, true);
      cb(new Error("Only .xer and .csv uploads are allowed"));
    },
  });

  // Middleware
  app.use(cors({
    origin: expressCorsOrigin(frontendOrigin),
    credentials: true,
  }));
  app.use((req, _res, next) => {
    console.log(`REQ ${req.method} ${req.path}`);
    next();
  });
  app.use(express.json());
  app.use(cookieParser());

  // Lightweight health endpoint for deployment checks
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "project-integrity-api" });
  });

  // OneDrive OAuth Configuration
  const ONEDRIVE_CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
  const ONEDRIVE_CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
  const ONEDRIVE_TENANT_ID = process.env.ONEDRIVE_TENANT_ID || "common";
  const REDIRECT_URI = `${process.env.APP_URL}/api/auth/onedrive/callback`;

  // Anthropic (server-only): used by /api/ai/* routes below.
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
  const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

  function extractAnthropicText(response: any): string {
    const block = response?.content?.[0];
    if (block?.type === "text" && typeof block.text === "string") return block.text;
    return "";
  }

  /** Load XER-derived project doc + activity sample for BIR™ (low-float biased). */
  async function loadBirPayloadFromFirestore(clientId: string, projectId: string) {
    if (!adminDb) return null;
    const projectRef = adminDb.collection("clients").doc(clientId).collection("projects").doc(projectId);
    const snap = await projectRef.get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    const actSnap = await projectRef.collection("activities").limit(120).get();
    const acts = actSnap.docs.map((x) => x.data() as Record<string, unknown>);
    acts.sort(
      (a, b) => (Number(a.totalFloat) ?? 99999) - (Number(b.totalFloat) ?? 99999)
    );
    const activitiesSample = acts.slice(0, 45).map((a) => ({
      id: String(a.id ?? ""),
      name: String(a.name ?? ""),
      startDate: String(a.startDate ?? ""),
      finishDate: String(a.finishDate ?? ""),
      totalFloat: Number(a.totalFloat ?? 0),
      isCritical: Boolean(a.isCritical),
      dependencies: Array.isArray(a.dependencies) ? (a.dependencies as unknown[]).map(String) : [],
      type: String(a.type ?? "task"),
    }));
    return {
      projectName: String(d.projectName ?? projectId),
      dataDate: String(d.dataDate ?? ""),
      summary: (d.summary ?? {}) as Record<string, unknown>,
      activitiesSample,
    };
  }

  // API route for manual sync trigger
  app.post("/api/workflow/sync", (req, res) => {
    console.log("Manual Sync Triggered:", req.body);
    
    // Simulate a manual sync process
    setTimeout(() => {
      const logEntry = {
        id: Date.now(),
        time: new Date().toISOString().replace('T', ' ').substring(0, 19),
        source: req.body.p6Type === 'eppm' ? "P6 EPPM" : "P6 Professional",
        projectName: "Global",
        action: "Manual Data Fetch",
        status: "Success",
        result: "Sync Completed",
        isPending: false
      };
      io.emit("webhook_update", logEntry);
    }, 2000);

    res.json({ status: "Sync Initiated" });
  });

  // Webhook endpoint for Primavera P6 / OPC
  app.post("/api/webhooks/primavera", (req, res) => {
    console.log("Received Primavera Webhook:", req.body);
    
    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: "Primavera P6",
      projectName: req.body.projectName || "Global",
      action: "Webhook Update",
      status: "Success",
      result: `Received ${Object.keys(req.body).length} data points`,
      isPending: false
    };
    
    // Broadcast the update to all connected clients
    io.emit("webhook_update", logEntry);
    
    res.status(200).json({ success: true, message: "Primavera Webhook Received" });
  });

  // Webhook endpoint for Acumen Fuse
  app.post("/api/webhooks/acumen", (req, res) => {
    console.log("Received Acumen Webhook:", req.body);
    
    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: "Acumen Fuse",
      projectName: req.body.projectName || "Project Alpha",
      action: "Analysis Webhook",
      status: "Success",
      result: "Real-time Analysis Complete",
      isPending: false
    };
    
    // Broadcast the update to all connected clients
    io.emit("webhook_update", logEntry);
    
    res.status(200).json({ success: true, message: "Acumen Webhook Received" });
  });

  // Webhook endpoint specifically for the P6 Desktop PowerShell Script
  app.post("/api/webhook/p6-trigger", (req, res) => {
    console.log("Received P6 Desktop Trigger:", req.body);
    
    const projectId = req.body.projectId || "Unknown Project";
    const source = req.body.source || "P6 Desktop Client";

    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: source,
      action: "Desktop Sync Trigger",
      status: "Success",
      result: `Syncing Project: ${projectId}`,
      isPending: false
    };
    
    // Broadcast the update to all connected clients
    io.emit("webhook_update", logEntry);
    
    res.status(200).json({ success: true, message: `Trigger received for project ${projectId}` });
  });

  // Webhook endpoint for ALICE Technologies
  app.post("/api/webhooks/alice", (req, res) => {
    console.log("Received ALICE Webhook:", req.body);
    
    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: "ALICE Technologies",
      projectName: req.body.projectName || "Project Alpha",
      action: "Generative Scheduling",
      status: "Success",
      result: "Scenario Optimization Complete",
      isPending: false
    };
    
    // Broadcast the update to all connected clients
    io.emit("webhook_update", logEntry);
    
    res.status(200).json({ success: true, message: "ALICE Webhook Received" });
  });

  // Webhook endpoint for SmartPM
  app.post("/api/webhooks/smartpm", (req, res) => {
    console.log("Received SmartPM Webhook:", req.body);
    
    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: "SmartPM",
      projectName: req.body.projectName || "Project Alpha",
      action: "Schedule Analytics",
      status: "Success",
      result: "SQI Analysis Complete",
      isPending: false
    };
    
    // Broadcast the update to all connected clients
    io.emit("webhook_update", logEntry);
    
    res.status(200).json({ success: true, message: "SmartPM Webhook Received" });
  });

  // --- Jira Integration Endpoints ---

  // Endpoint to check Jira health
  app.post("/api/jira/health", (req, res) => {
    console.log("Checking Jira Health with parameters:", req.body);
    const { jiraUrl, jiraEmail, jiraApiToken, jiraProjectKey } = req.body;

    // Simulate a health check delay
    setTimeout(() => {
      // Basic validation to simulate a successful connection if fields are present
      if (jiraUrl && jiraEmail && jiraApiToken && jiraProjectKey) {
        res.status(200).json({ success: true, message: "Jira Connection Healthy" });
      } else {
        res.status(400).json({ success: false, message: "Jira Connection Failed" });
      }
    }, 1500);
  });

  // Endpoint to link a log entry to a Jira issue
  app.post("/api/jira/link", (req, res) => {
    const { logId, issueKey, summary } = req.body;
    console.log(`Linking Log ${logId} to Jira Issue ${issueKey}: ${summary}`);

    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: "Jira Integration",
      action: "Issue Linked",
      status: "Success",
      result: `Linked Log #${logId} to ${issueKey}`,
      isPending: false
    };
    
    io.emit("webhook_update", logEntry);
    res.json({ success: true });
  });

  // Endpoint to trigger ALICE simulation
  app.post("/api/workflow/alice-simulate", (req, res) => {
    console.log("Triggering ALICE Simulation with parameters:", req.body);
    
    const { duration, optimizationGoal, constructionMethod } = req.body;

    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: "ALICE Technologies",
      projectName: req.body.projectName || "Project Alpha",
      action: "Simulation Triggered",
      status: "Pending",
      result: `Goal: ${optimizationGoal}, Method: ${constructionMethod}`,
      isPending: true
    };
    
    io.emit("webhook_update", logEntry);

    // Simulate async completion
    setTimeout(() => {
      const completeLog = {
        id: Date.now(),
        time: new Date().toISOString().replace('T', ' ').substring(0, 19),
        source: "ALICE Technologies",
        projectName: req.body.projectName || "Project Alpha",
        action: "Simulation Complete",
        status: "Success",
        result: `Generated 3 scenarios in ${duration} days max`,
        isPending: false
      };
      io.emit("webhook_update", completeLog);
    }, 4000);
    
    res.status(200).json({ success: true, message: "ALICE Simulation Triggered" });
  });

  // Endpoint to cancel a workflow task
  app.post("/api/workflow/cancel", (req, res) => {
    const { source, action } = req.body;
    console.log(`Cancelling task for ${source}: ${action}`);

    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: source || "System",
      action: action || "Workflow Task",
      status: "Cancelled",
      result: "User terminated process",
      isPending: false
    };
    
    io.emit("webhook_update", logEntry);
    res.json({ success: true });
  });

  function slugifyProjectId(raw: string, fallback: string) {
    const s = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return s || fallback;
  }

  /** Recent manual uploads for a client/project (PRD manual ingest). */
  app.get("/api/ingest/uploads", async (req, res) => {
    if (!adminDb) return res.json({ uploads: [] });
    const clientId = String(req.query.clientId || "default");
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) return res.status(400).json({ error: "projectId query parameter is required" });
    try {
      const snap = await adminDb
        .collection("clients")
        .doc(clientId)
        .collection("projects")
        .doc(projectId)
        .collection("uploads")
        .orderBy("uploadedAt", "desc")
        .limit(Number(req.query.limit) || 20)
        .get();
      const uploads = snap.docs.map((d) => {
        const data = d.data();
        const uploadedAt = data.uploadedAt?.toDate?.() ?? null;
        return {
          id: d.id,
          ...data,
          uploadedAt: uploadedAt ? uploadedAt.toISOString() : null,
        };
      });
      res.json({ uploads });
    } catch (e: any) {
      console.error("ingest/uploads list error:", e);
      res.status(500).json({ error: e?.message || "Failed to list uploads" });
    }
  });

  app.post("/api/workflow/upload", (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File exceeds 52 MB limit" });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(400).json({ error: err.message || "Upload rejected" });
      next();
    });
  }, async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const originalName: string = req.file.originalname;
    const clientId: string = (req.body.clientId || "default").toString().trim() || "default";
    const bodyProjectId = (req.body.projectId || "").toString().trim();
    const bodyName = (req.body.projectName || "").toString().trim();
    const fallbackSlug = originalName.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-").toLowerCase();
    const projectId = slugifyProjectId(bodyProjectId || bodyName, fallbackSlug);
    const ext = originalName.split(".").pop()?.toLowerCase();
    const uploadId = randomUUID();
    const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");

    console.log(`Upload received: ${originalName} | client: ${clientId} | project: ${projectId} | uploadId: ${uploadId}`);

    // ── Emit immediate "received" log ──
    const receivedLog = {
      id: Date.now(),
      time: new Date().toISOString().replace("T", " ").substring(0, 19),
      source: "File Upload",
      action: "File Received",
      status: "Pending",
      projectName: projectId,
      result: `Processing: ${originalName} (${(req.file.size / 1024).toFixed(1)} KB)`,
      isPending: true,
    };
    io.emit("webhook_update", receivedLog);

    let storagePath: string | null = null;
    if (adminBucket) {
      storagePath = `clients/${clientId}/projects/${projectId}/uploads/${uploadId}/${encodeURIComponent(originalName)}`;
      try {
        await adminBucket.file(storagePath).save(req.file.buffer, {
          contentType: req.file.mimetype || "application/octet-stream",
          resumable: false,
        });
      } catch (se: any) {
        console.warn("Firebase Storage upload failed (metadata still recorded if Firestore available):", se?.message);
        storagePath = null;
      }
    }

    try {
      let parsed: ReturnType<typeof parseXer> | null = null;

      // ── XER parsing ──
      if (ext === "xer") {
        const xerText = req.file.buffer.toString("utf-8");
        parsed = parseXer(xerText);
        console.log(`XER parsed: ${parsed.projectName} | ${parsed.summary.totalActivities} activities | SQI: ${parsed.summary.qualityScore}`);
      }

      // ── Write to Firestore (project summary + activities) ──
      if (parsed && adminDb) {
        const projectRef = adminDb
          .collection("clients")
          .doc(clientId)
          .collection("projects")
          .doc(projectId);

        await projectRef.set({
          projectName: parsed.projectName,
          dataDate: parsed.dataDate,
          startDate: parsed.startDate,
          finishDate: parsed.finishDate,
          ingestedAt: parsed.ingestedAt,
          summary: parsed.summary,
          qualityTrend: parsed.qualityTrend,
          sourceFile: originalName,
        }, { merge: true });

        const BATCH_SIZE = 400;
        for (let i = 0; i < parsed.activities.length; i += BATCH_SIZE) {
          const batch = adminDb.batch();
          const chunk = parsed.activities.slice(i, i + BATCH_SIZE);
          for (const act of chunk) {
            const ref = projectRef.collection("activities").doc(act.id);
            batch.set(ref, act, { merge: true });
          }
          await batch.commit();
        }

        console.log(`Firestore write complete — ${parsed.activities.length} activities saved`);
      } else if (parsed && !adminDb) {
        console.warn("Firestore not available — parsed data not persisted");
      }

      // ── Upload artifact record (PRD manual ingest) ──
      if (adminDb) {
        const projectRef = adminDb
          .collection("clients")
          .doc(clientId)
          .collection("projects")
          .doc(projectId);
        let status: string;
        if (ext === "xer") status = parsed ? "parsed" : "stored";
        else status = "stored";
        await projectRef.collection("uploads").doc(uploadId).set({
          originalName,
          storagePath,
          sha256,
          mimeType: req.file.mimetype || "application/octet-stream",
          sizeBytes: req.file.size,
          uploadedAt: FieldValue.serverTimestamp(),
          uploadedBy: (req.body.uploadedBy || "system").toString(),
          status,
          parserVersion: parsed ? "xerParser-v1" : null,
          activityCount: parsed?.summary?.totalActivities ?? null,
        });
      }

      // ── Emit success log ──
      const successLog = {
        id: Date.now(),
        time: new Date().toISOString().replace("T", " ").substring(0, 19),
        source: ext === "xer" ? "Primavera P6 XER" : "File Upload",
        action: "Schedule Ingested",
        status: "Success",
        projectName: parsed?.projectName ?? projectId,
        result: parsed
          ? `${parsed.summary.totalActivities} activities | SQI: ${parsed.summary.qualityScore} | SPI: ${parsed.summary.spi} | CPI: ${parsed.summary.cpi}`
          : `Uploaded: ${originalName}`,
        isPending: false,
      };
      io.emit("webhook_update", successLog);

      res.json({
        success: true,
        uploadId,
        fileName: originalName,
        clientId,
        projectId,
        sha256,
        storagePath,
        parsed: parsed ? {
          projectName: parsed.projectName,
          totalActivities: parsed.summary.totalActivities,
          qualityScore: parsed.summary.qualityScore,
          spi: parsed.summary.spi,
          cpi: parsed.summary.cpi,
          dataDate: parsed.dataDate,
        } : null,
      });

    } catch (error: any) {
      console.error("Upload processing error:", error);
      if (adminDb) {
        try {
          const projectRef = adminDb.collection("clients").doc(clientId).collection("projects").doc(projectId);
          await projectRef.collection("uploads").doc(uploadId).set({
            originalName,
            storagePath,
            sha256,
            mimeType: req.file.mimetype || "application/octet-stream",
            sizeBytes: req.file.size,
            uploadedAt: FieldValue.serverTimestamp(),
            uploadedBy: (req.body.uploadedBy || "system").toString(),
            status: "parse_failed",
            parserVersion: ext === "xer" ? "xerParser-v1" : null,
            activityCount: null,
            error: String(error?.message || error),
          }, { merge: true });
        } catch (fe) {
          console.warn("Failed to write parse_failed upload doc:", fe);
        }
      }
      io.emit("webhook_update", {
        id: Date.now(),
        time: new Date().toISOString().replace("T", " ").substring(0, 19),
        source: "File Upload",
        action: "Parse Failed",
        status: "Failed",
        projectName: projectId,
        result: error.message ?? "Unknown error",
        isPending: false,
      });
      res.status(500).json({ error: "File processing failed", detail: error.message });
    }
  });

  // Endpoint to check P6 health
  app.post("/api/workflow/p6-health", (req, res) => {
    console.log("Checking P6 Health with parameters:", req.body);
    
    const { p6Type, p6Url, p6Username, p6Password } = req.body;

    // Simulate a health check delay
    setTimeout(() => {
      // Basic validation to simulate a successful connection if fields are present
      if (p6Url && p6Username && p6Password) {
        res.status(200).json({ success: true, message: "P6 Connection Healthy" });
      } else {
        res.status(400).json({ success: false, message: "P6 Connection Failed" });
      }
    }, 1500);
  });

  // --- Anthropic AI Routes (server-only) ---
  app.post("/api/ai/summarize", async (req, res) => {
    if (!anthropic) {
      return res.status(500).json({ error: "Anthropic API key not configured" });
    }

    const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];
    const logText = logs
      .map(
        (l: any) =>
          `[${l.time}] ${l.source} | Project: ${l.projectName || "Global"} | ${l.action} — ${l.status} (${l.result})`
      )
      .join("\n");

    const prompt = `You are a senior project controls analyst reviewing automated workflow logs for a construction project governance system.

Analyse the following workflow logs and provide a concise professional summary (3–5 sentences). 
- Highlight any failures, timeouts, or anomalies
- Note which data sources are active vs. failing
- Flag any patterns that suggest a data pipeline issue
- End with one recommended action if any issues exist

Logs:
${logText}`;

    try {
      const response = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });

      const summary = extractAnthropicText(response) || "No summary generated.";
      res.json({ summary });
    } catch (error: any) {
      console.error("Claude Log Summarization Error:", error);
      res.status(500).json({ error: error?.message || "Summarization failed" });
    }
  });

  app.post("/api/ai/analyze-risk", async (req, res) => {
    if (!anthropic) {
      return res.status(500).json({ error: "Anthropic API key not configured" });
    }

    const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    const metrics = req.body?.metrics ?? {};

    const taskText = tasks
      .map(
        (t: any) =>
          `- ${t.name}: Start ${t.startDate}, Duration ${t.duration}d, Type: ${t.type}, Dependencies: [${
            Array.isArray(t.dependencies) && t.dependencies.length ? t.dependencies.join(", ") : "none"
          }]`
      )
      .join("\n");

    const metricsText = JSON.stringify(metrics, null, 2);

    const prompt = `You are a certified planning engineer (PMI-SP) and earned value management specialist with 15 years of AEC industry experience.

Perform a schedule risk analysis on the following project data. Structure your response with these sections:

**Critical Path Assessment**
Identify the critical path from the task list and any near-critical paths (total float < 5 days).

**EVM Performance Interpretation**
Interpret the SPI and CPI trends. Flag any variance thresholds that require corrective action (SPI < 0.95 or CPI < 0.95).

**Top 3 Schedule Risks**
List the three highest-priority risks with predicted impact in days and cost.

**Recommended Recovery Actions**
Provide 2–3 specific, actionable recovery strategies appropriate for the current schedule position.

Keep the analysis concise and specific — avoid generic advice. Write as if presenting to a project owner.

Schedule Tasks:
${taskText}

EVM & Performance Metrics:
${metricsText}`;

    try {
      const response = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const analysis = extractAnthropicText(response) || "No analysis generated.";
      res.json({ analysis });
    } catch (error: any) {
      console.error("Claude Risk Analysis Error:", error);
      res.status(500).json({ error: error?.message || "Risk analysis failed" });
    }
  });

  // --- P1: Multi-client portfolio (schedule health across engagements) ---
  app.get("/api/portfolio/summary", async (_req, res) => {
    if (!adminDb) {
      return res.json({ engagements: [], generatedAt: new Date().toISOString(), note: "Firestore not configured" });
    }
    try {
      const clientsSnap = await adminDb.collection("clients").get();
      const engagements: any[] = [];
      for (const c of clientsSnap.docs) {
        const clientId = c.id;
        const cdata = c.data() || {};
        const projectsSnap = await adminDb.collection("clients").doc(clientId).collection("projects").get();
        for (const p of projectsSnap.docs) {
          const d = p.data() || {};
          const s = (d.summary ?? {}) as Record<string, unknown>;
          engagements.push({
            clientId,
            clientLabel: typeof cdata.displayName === "string" ? cdata.displayName : clientId,
            engagementStatus: typeof cdata.engagementStatus === "string" ? cdata.engagementStatus : "active",
            projectId: p.id,
            projectName: typeof d.projectName === "string" ? d.projectName : p.id,
            dataDate: d.dataDate ?? null,
            ingestedAt: d.ingestedAt ?? null,
            sourceFile: d.sourceFile ?? null,
            health: {
              qualityScore: s.qualityScore ?? null,
              spi: s.spi ?? null,
              cpi: s.cpi ?? null,
              totalActivities: s.totalActivities ?? null,
              criticalActivities: s.criticalActivities ?? null,
              percentComplete: s.percentComplete ?? null,
            },
            summarySnapshot: d.summary ?? null,
          });
        }
      }
      engagements.sort((a, b) => {
        const ta = a.ingestedAt ? new Date(String(a.ingestedAt)).getTime() : 0;
        const tb = b.ingestedAt ? new Date(String(b.ingestedAt)).getTime() : 0;
        return tb - ta;
      });
      res.json({ engagements, generatedAt: new Date().toISOString() });
    } catch (e: any) {
      console.error("portfolio/summary", e);
      res.status(500).json({ error: e?.message || "Portfolio read failed" });
    }
  });

  // --- P1: BIR™ — Claude analysis wired to XER parser output (Firestore or inline JSON) ---
  app.post("/api/ai/bir", async (req, res) => {
    if (!anthropic) return res.status(500).json({ error: "Anthropic API key not configured" });
    const clientContext = typeof req.body?.clientContext === "string" ? req.body.clientContext : undefined;
    let payload: {
      projectName: string;
      dataDate: string;
      summary: Record<string, unknown>;
      activitiesSample: Array<Record<string, unknown>>;
    } | null = null;

    if (req.body?.parsedPayload && typeof req.body.parsedPayload === "object") {
      const pp = req.body.parsedPayload;
      payload = {
        projectName: String(pp.projectName ?? "Project"),
        dataDate: String(pp.dataDate ?? ""),
        summary: (pp.summary ?? {}) as Record<string, unknown>,
        activitiesSample: Array.isArray(pp.activitiesSample) ? pp.activitiesSample : [],
      };
    } else {
      const clientId = String(req.body?.clientId ?? "").trim();
      const projectId = String(req.body?.projectId ?? "").trim();
      if (!clientId || !projectId) {
        return res.status(400).json({
          error: "Provide clientId + projectId, or parsedPayload { projectName, dataDate, summary, activitiesSample }",
        });
      }
      payload = await loadBirPayloadFromFirestore(clientId, projectId);
      if (!payload) return res.status(404).json({ error: "Project not found in Firestore" });
    }

    const prompt = buildBirPrompt({
      projectName: payload.projectName,
      dataDate: payload.dataDate,
      summary: payload.summary,
      activitiesSample: payload.activitiesSample as any,
      clientContext,
    });

    try {
      const response = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const analysis = extractAnthropicText(response) || "No analysis generated.";
      res.json({ analysis, model: ANTHROPIC_MODEL, methodology: "BIR™" });
    } catch (error: any) {
      console.error("BIR error:", error);
      res.status(500).json({ error: error?.message || "BIR analysis failed" });
    }
  });

  // --- P1: TRIAGE-IMPACT™ — structured TIA-style report generation ---
  app.post("/api/ai/triage-impact-report", async (req, res) => {
    if (!anthropic) return res.status(500).json({ error: "Anthropic API key not configured" });
    const projectName = String(req.body?.projectName ?? "").trim();
    if (!projectName) return res.status(400).json({ error: "projectName is required" });
    const scheduleFacts =
      req.body?.scheduleFacts && typeof req.body.scheduleFacts === "object"
        ? req.body.scheduleFacts
        : {};
    const impactingEvents = Array.isArray(req.body?.impactingEvents) ? req.body.impactingEvents : [];
    if (impactingEvents.length === 0) {
      return res.status(400).json({ error: "impactingEvents array is required (at least one event)" });
    }

    const prompt = buildTriageImpactPrompt({
      projectName,
      scheduleFacts,
      impactingEvents,
      ownerNarrative: typeof req.body?.ownerNarrative === "string" ? req.body.ownerNarrative : undefined,
      analysisWindow:
        req.body?.analysisWindow && typeof req.body.analysisWindow === "object"
          ? req.body.analysisWindow
          : undefined,
      reliefSought: typeof req.body?.reliefSought === "string" ? req.body.reliefSought : undefined,
    });

    try {
      const response = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 6144,
        messages: [{ role: "user", content: prompt }],
      });
      const report = extractAnthropicText(response) || "No report generated.";
      res.json({ report, model: ANTHROPIC_MODEL, methodology: "TRIAGE-IMPACT™" });
    } catch (error: any) {
      console.error("TRIAGE-IMPACT error:", error);
      res.status(500).json({ error: error?.message || "TRIAGE-IMPACT report failed" });
    }
  });

  // --- OneDrive OAuth Routes ---

  app.get("/api/auth/onedrive/url", (req, res) => {
    const params = new URLSearchParams({
      client_id: ONEDRIVE_CLIENT_ID || "",
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      response_mode: "query",
      scope: "files.read offline_access User.Read",
      state: "onedrive_auth"
    });
    const authUrl = `https://login.microsoftonline.com/${ONEDRIVE_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get("/api/auth/onedrive/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${ONEDRIVE_TENANT_ID}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: ONEDRIVE_CLIENT_ID || "",
          client_secret: ONEDRIVE_CLIENT_SECRET || "",
          code: code as string,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code"
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const { access_token, refresh_token } = response.data;

      // Set cookies for the session
      res.cookie("onedrive_token", access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 3600 * 1000 // 1 hour
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'onedrive' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("OneDrive Token Exchange Error:", error.response?.data || error.message);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/onedrive/status", (req, res) => {
    const token = req.cookies.onedrive_token;
    res.json({ connected: !!token });
  });

  app.get("/api/onedrive/files", async (req, res) => {
    const token = req.cookies.onedrive_token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      // List files in the root or a specific folder
      // For this demo, we'll look for .xer files
      const response = await axios.get(
        "https://graph.microsoft.com/v1.0/me/drive/root/children",
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            $select: "id,name,webUrl,size,file,lastModifiedDateTime",
            $filter: "endsWith(name, '.xer')"
          }
        }
      );

      res.json({ files: response.data.value });
    } catch (error: any) {
      console.error("OneDrive List Files Error:", error.response?.data || error.message);
      if (error.response?.status === 401) {
        res.clearCookie("onedrive_token");
      }
      res.status(error.response?.status || 500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/workflow/ingest", (req, res) => {
    const { fileId, fileName, projectName: bodyProjectName } = req.body;
    const projectName = bodyProjectName || fileName.replace(/\.[^/.]+$/, "");
    console.log(`Ingesting file: ${fileName} (${fileId}) for project: ${projectName}`);

    const logEntry = {
      id: Date.now(),
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      source: "OneDrive",
      action: "File Ingestion",
      status: "Success",
      projectName: projectName,
      result: `Ingested: ${fileName}`,
      isPending: false
    };
    
    io.emit("webhook_update", logEntry);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    const hasBuiltFrontend = fs.existsSync(indexPath);

    if (hasBuiltFrontend) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(indexPath);
      });
    } else {
      // Allow API-only deployments to run even if dist is missing.
      app.get('/', (_req, res) => {
        res.status(200).json({
          ok: true,
          service: "project-integrity-api",
          note: "Frontend build not found at /dist",
        });
      });
    }
  }

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("EXPRESS_ERROR", err);
    res.status(500).json({ error: "Internal server error" });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("FATAL: startServer()", err);
  process.exit(1);
});

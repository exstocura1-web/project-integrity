import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import cookieParser from "cookie-parser";
import axios from "axios";
import multer from "multer";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { parseXer } from "./src/services/xerParser.js";

// Firebase Admin (server-side Firestore writes)
// Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env
let adminDb: ReturnType<typeof getFirestore> | null = null;
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
  console.log("Firebase Admin initialised");
} catch (e) {
  console.warn("Firebase Admin not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env");
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });
  const PORT = 3000;

  // Multer setup for local file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  // Middleware
  app.use(express.json());
  app.use(cookieParser());

  // OneDrive OAuth Configuration
  const ONEDRIVE_CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
  const ONEDRIVE_CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
  const ONEDRIVE_TENANT_ID = process.env.ONEDRIVE_TENANT_ID || "common";
  const REDIRECT_URI = `${process.env.APP_URL}/api/auth/onedrive/callback`;

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

  app.post("/api/workflow/upload", upload.single("file"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const originalName: string = req.file.originalname;
    const clientId: string = req.body.clientId || "default";
    const projectId: string = req.body.projectId || originalName.replace(/\.[^/.]+$/, "").replace(/\s+/g, "-").toLowerCase();
    const ext = originalName.split(".").pop()?.toLowerCase();

    console.log(`Upload received: ${originalName} | client: ${clientId} | project: ${projectId}`);

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

    try {
      let parsed = null;

      // ── XER parsing ──
      if (ext === "xer") {
        const xerText = req.file.buffer.toString("utf-8");
        parsed = parseXer(xerText);
        console.log(`XER parsed: ${parsed.projectName} | ${parsed.summary.totalActivities} activities | SQI: ${parsed.summary.qualityScore}`);
      }

      // ── Write to Firestore ──
      if (parsed && adminDb) {
        const projectRef = adminDb
          .collection("clients")
          .doc(clientId)
          .collection("projects")
          .doc(projectId);

        // Write summary metrics (dashboard KPI cards read from here)
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

        // Write activities in batches of 400 (Firestore batch limit is 500)
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
        fileName: originalName,
        projectId,
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

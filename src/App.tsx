import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Activity, 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  Database, 
  AlertTriangle, 
  AlertCircle,
  RefreshCw, 
  ShieldCheck,
  LayoutDashboard,
  Settings,
  FileText,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  Cloud,
  FileCode,
  ArrowRightLeft,
  Mail,
  Share2,
  LogOut,
  Plus,
  Trash2,
  Shield,
  User,
  Lock,
  Cpu,
  Check,
  Kanban,
  Network,
  LayoutGrid
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { 
  addDays, 
  format, 
  isAfter, 
  isBefore, 
  parseISO, 
  startOfDay, 
  differenceInDays, 
  max 
} from 'date-fns';
import {
  auth,
  db,
  googleProvider,
  ensureAuthPersistence,
  signInWithGoogle,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from './firebase';

interface GovernanceRule {
  id: string;
  metric: string;
  operator: string;
  threshold: number;
  action: string;
  severity: 'low' | 'medium' | 'high';
  enabled: boolean;
  createdBy: string;
  createdAt: any;
}

interface ScheduleTask {
  id: string;
  name: string;
  startDate: string;
  duration: number;
  dependencies: string[];
  type: 'task' | 'milestone';
}

const MOCK_TASKS: ScheduleTask[] = [
  { id: '1', name: 'Site Preparation', startDate: '2026-03-20', duration: 10, dependencies: [], type: 'task' },
  { id: '2', name: 'Foundation Pour', startDate: '2026-03-30', duration: 15, dependencies: ['1'], type: 'task' },
  { id: '3', name: 'Steel Erection', startDate: '2026-04-15', duration: 20, dependencies: ['2'], type: 'task' },
  { id: '4', name: 'Enclosure Milestone', startDate: '2026-05-05', duration: 0, dependencies: ['3'], type: 'milestone' },
  { id: '5', name: 'MEP Rough-in', startDate: '2026-05-05', duration: 25, dependencies: ['4'], type: 'task' },
  { id: '6', name: 'Interior Finishes', startDate: '2026-06-01', duration: 30, dependencies: ['5'], type: 'task' },
];

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MOCK_HISTORY = [
  { date: 'Mar 10', quality: 78, risk: 22 },
  { date: 'Mar 11', quality: 82, risk: 20 },
  { date: 'Mar 12', quality: 80, risk: 25 },
  { date: 'Mar 13', quality: 85, risk: 18 },
  { date: 'Mar 14', quality: 88, risk: 15 },
  { date: 'Mar 15', quality: 87, risk: 16 },
  { date: 'Mar 16', quality: 91, risk: 12 },
];

const MOCK_METRICS_HISTORY = [
  { date: 'Jan', spi: 0.92, cpi: 0.88, variance: -12000 },
  { date: 'Feb', spi: 0.95, cpi: 0.90, variance: -8000 },
  { date: 'Mar', spi: 1.02, cpi: 0.98, variance: 4000 },
  { date: 'Apr', spi: 1.05, cpi: 1.01, variance: 12000 },
  { date: 'May', spi: 0.98, cpi: 0.95, variance: -2000 },
  { date: 'Jun', spi: 1.01, cpi: 0.99, variance: 5000 },
];

const MOCK_LOGS = [
  { id: 1, time: "2026-03-16 09:42:12", source: "Primavera P6", projectName: "Project Alpha", action: "Data Fetch", status: "Success", result: "1,240 Activities", isPending: false },
  { id: 2, time: "2026-03-16 09:43:05", source: "Acumen", projectName: "Project Alpha", action: "Fuse Analysis", status: "Success", result: "Score: 91/100", isPending: false },
  { id: 3, time: "2026-03-16 09:44:10", source: "Governance", projectName: "Project Alpha", action: "KPI Calculation", status: "Success", result: "CPI: 0.98, SPI: 1.02", isPending: false },
  { id: 8, time: "2026-03-16 11:15:22", source: "SharePoint", projectName: "Project Alpha", action: "Email Scrape", status: "Success", result: "Ingested: schedule_v2.xer", isPending: false },
  { id: 4, time: "2026-03-16 03:00:00", source: "System", projectName: "Global", action: "Auto-Sync", status: "Success", result: "Completed in 4.2s", isPending: false },
  { id: 5, time: "2026-03-15 15:30:00", source: "Primavera P6", projectName: "Project Beta", action: "Data Fetch", status: "Failed", result: "API Timeout", isPending: false },
  { id: 6, time: "2026-03-15 03:00:00", source: "System", projectName: "Global", action: "Auto-Sync", status: "Success", result: "Completed in 3.8s", isPending: false },
  { id: 7, time: "2026-03-14 03:00:00", source: "System", projectName: "Global", action: "Auto-Sync", status: "Success", result: "Completed in 4.1s", isPending: false },
];

import {
  summarizeLogs,
  analyzeScheduleRisk,
  fetchPortfolioEngagements,
  runBirAnalysis,
  runTriageImpactReport,
} from './services/claudeService';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '');

function apiUrl(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
  });
}

/** Must match server `slugifyProjectId` for manual ingest API. */
function slugifyProjectIdForUpload(raw: string, fallback: string) {
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || fallback;
}

/** One line per event: optional "YYYY-MM-DD | description" or free text. */
function parseTriageEventsLines(raw: string): { description: string; date?: string; source?: string }[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const pipe = line.indexOf("|");
      if (pipe > 0) {
        const left = line.slice(0, pipe).trim();
        const right = line.slice(pipe + 1).trim();
        const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(left);
        if (looksLikeDate) return { date: left, description: right || left, source: "Analyst" };
      }
      return { description: line, source: "Analyst" };
    });
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [aiLogSummary, setAiLogSummary] = useState<string | null>(null);
  const [aiRiskAnalysis, setAiRiskAnalysis] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isAnalyzingRisk, setIsAnalyzingRisk] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'editor' | 'viewer' | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [governanceRules, setGovernanceRules] = useState<GovernanceRule[]>([]);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('portfolio');
  const [analyticsMetrics, setAnalyticsMetrics] = useState(MOCK_METRICS_HISTORY);
  const [smartPmMetrics, setSmartPmMetrics] = useState({
    compression: 14.2,
    volatility: 'Medium',
    healthScore: 84
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  
  // Agentic State
  const [agenticInsights, setAgenticInsights] = useState([
    { id: 1, type: 'risk', title: 'Critical Path Delay Predicted', description: 'RFI #402 (Steel Connection) is 5 days overdue. Predicted impact: 12 days to Milestone 3.', severity: 'high', status: 'pending' },
    { id: 2, type: 'optimize', title: 'Recovery Scenario Available', description: 'AI has generated a recovery sequence for Phase 2 that saves 8 days by re-sequencing MEP rough-in.', severity: 'medium', status: 'pending' },
    { id: 3, type: 'automate', title: 'Submittal Sync Complete', description: '14 new submittals ingested from Procore. 2 identified as long-lead items requiring immediate review.', severity: 'low', status: 'resolved' },
  ]);
  
  // Configuration State
  const [p6Type, setP6Type] = useState('eppm');
  const [p6Url, setP6Url] = useState('');
  const [p6Username, setP6Username] = useState('');
  const [p6Password, setP6Password] = useState('');
  const [acumenApiKey, setAcumenApiKey] = useState('');
  const [acumenDeploymentType, setAcumenDeploymentType] = useState('cloud');
  const [acumenLocalUrl, setAcumenLocalUrl] = useState('');
  const [aliceApiKey, setAliceApiKey] = useState('');
  const [smartPmApiKey, setSmartPmApiKey] = useState('');
  
  // ALICE Simulation Parameters
  const [aliceDuration, setAliceDuration] = useState('365');
  const [aliceOptimizationGoal, setAliceOptimizationGoal] = useState('duration');
  const [aliceConstructionMethod, setAliceConstructionMethod] = useState('standard');
  const [isAliceSimulating, setIsAliceSimulating] = useState(false);

  // OneDrive State
  const [oneDriveConnected, setOneDriveConnected] = useState(false);
  const [oneDriveFiles, setOneDriveFiles] = useState<any[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDraggingLocal, setIsDraggingLocal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualIngestClientId, setManualIngestClientId] = useState("default");
  const [ingestUploadHistory, setIngestUploadHistory] = useState<any[]>([]);
  const [ingestHistoryLoading, setIngestHistoryLoading] = useState(false);

  const [portfolioData, setPortfolioData] = useState<{ engagements: any[] } | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioErr, setPortfolioErr] = useState<string | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<any | null>(null);
  const [triageEventsText, setTriageEventsText] = useState(
    "2026-03-01 | Owner-directed suspension of Area B concrete pours\n2026-03-15 | Revised drawing set R3 issued — structural"
  );
  const [triageOwnerNotes, setTriageOwnerNotes] = useState("");
  const [methodologyOutput, setMethodologyOutput] = useState<string | null>(null);
  const [methodologyMeta, setMethodologyMeta] = useState<string | null>(null);
  const [birRunning, setBirRunning] = useState(false);
  const [triageRunning, setTriageRunning] = useState(false);

  // Cancellation State
  const [activeTask, setActiveTask] = useState<{ source: string, action: string } | null>(null);

  // P6 Health Check State
  const [isCheckingP6Health, setIsCheckingP6Health] = useState(false);
  const [p6HealthStatus, setP6HealthStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown');
  const [p6LastHealthCheck, setP6LastHealthCheck] = useState<string | null>(null);
  const [analyzedProject, setAnalyzedProject] = useState<string | null>(null);
  const [projectNameInput, setProjectNameInput] = useState<string>('');
  const [isProjectNameConfirmed, setIsProjectNameConfirmed] = useState(false);
  const [tasks, setTasks] = useState<ScheduleTask[]>(MOCK_TASKS);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedDependency, setSelectedDependency] = useState<{ from: string, to: string } | null>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [scheduleViewMode, setScheduleViewMode] = useState<'gantt' | 'network'>('gantt');

  // SharePoint Email Scraper State
  const [sharepointEmail, setSharepointEmail] = useState('ingest-sp-alpha@acumen-gov.ai');
  const [sharepointStatus, setSharepointStatus] = useState<'running' | 'paused' | 'error'>('running');
  const [sharepointLastError, setSharepointLastError] = useState<string | null>(null);
  const [sharepointSiteUrl, setSharepointSiteUrl] = useState('');
  const [sharepointUrlError, setSharepointUrlError] = useState<string | null>(null);
  const [isSharepointUrlValid, setIsSharepointUrlValid] = useState(false);

  // Jira Integration State
  const [jiraUrl, setJiraUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraApiToken, setJiraApiToken] = useState('');
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [isCheckingJiraHealth, setIsCheckingJiraHealth] = useState(false);
  const [jiraHealthStatus, setJiraHealthStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown');
  const [isLinkingJira, setIsLinkingJira] = useState<string | null>(null); // Log ID being linked

  const validateSharepointUrl = (url: string) => {
    if (!url) {
      setSharepointUrlError("SharePoint Site URL is required");
      setIsSharepointUrlValid(false);
      return false;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setSharepointUrlError("URL must start with http:// or https://");
        setIsSharepointUrlValid(false);
        return false;
      }
      
      // Basic SharePoint domain check (optional but adds "robustness")
      if (!parsed.hostname.includes('sharepoint.com') && !parsed.hostname.includes('localhost')) {
        setSharepointUrlError("Warning: URL does not appear to be a standard SharePoint domain");
        // We still allow it but show a warning
      } else {
        setSharepointUrlError(null);
      }
      
      setIsSharepointUrlValid(true);
      return true;
    } catch (e) {
      setSharepointUrlError("Invalid URL format (e.g., https://example.com)");
      setIsSharepointUrlValid(false);
      return false;
    }
  };

  const toggleSharepointAgent = () => {
    if (sharepointStatus !== 'running') {
      if (validateSharepointUrl(sharepointSiteUrl)) {
        setSharepointStatus('running');
        setSharepointLastError(null);
        addWorkflowLog({
          source: "SharePoint Scraper",
          action: "Agent Started",
          status: "Success",
          result: `Monitoring: ${sharepointSiteUrl}`
        });
      } else {
        setSharepointStatus('error');
        setSharepointLastError("Configuration Error: Invalid SharePoint Site URL");
      }
    } else {
      setSharepointStatus('paused');
      setSharepointUrlError(null);
      setSharepointLastError(null);
      addWorkflowLog({
        source: "SharePoint Scraper",
        action: "Agent Paused",
        status: "Warning",
        result: "Manual pause triggered"
      });
    }
  };

  const handleSummarizeLogs = async () => {
    setIsSummarizing(true);
    try {
      const summary = await summarizeLogs(logs);
      setAiLogSummary(summary || "No summary generated.");
    } catch (error) {
      console.error("Summarization failed", error);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleAnalyzeRisk = async () => {
    setIsAnalyzingRisk(true);
    try {
      const analysis = await analyzeScheduleRisk(MOCK_TASKS, analyticsMetrics);
      setAiRiskAnalysis(analysis || "No analysis generated.");
    } catch (error) {
      console.error("Risk analysis failed", error);
    } finally {
      setIsAnalyzingRisk(false);
    }
  };

  const handleDownloadAgent = () => {
    const scriptContent = `# Acumen Fuse Local Gateway (Zero-Dependency)
$port = 8080
$acumenPath = "C:\\Program Files\\Deltek\\Acumen\\Acumen.exe"

if (-Not (Test-Path $acumenPath)) {
    Write-Warning "Acumen.exe not found at $acumenPath. Please update the script with the correct path."
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  Acumen Fuse Local Gateway is Running!" -ForegroundColor Green
Write-Host "  Listening on: http://localhost:$port/"
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Next Step: Open a new terminal and run 'ngrok http $port'" -ForegroundColor Yellow

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream)
            $body = $reader.ReadToEnd()
            $json = $body | ConvertFrom-Json

            $projectPath = if ($json.projectPath) { $json.projectPath } else { "C:\\path\\to\\project.xml" }
            $exportPath = if ($json.exportPath) { $json.exportPath } else { "C:\\path\\to\\results.csv" }

            $command = "& \`"$acumenPath\`" /run \`"$projectPath\`" /export \`"$exportPath\`""
            Write-Host "Executing: $command"

            try {
                $process = Start-Process -FilePath $acumenPath -ArgumentList "/run \`"$projectPath\`" /export \`"$exportPath\`"" -Wait -NoNewWindow -PassThru
                $result = @{ success = $true; message = "Analysis complete"; exitCode = $process.ExitCode }
            } catch {
                $result = @{ success = $false; error = $_.Exception.Message }
                $response.StatusCode = 500
            }

            $jsonResponse = $result | ConvertTo-Json -Depth 10
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
}
`;
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'acumen-agent.ps1';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Firebase Auth: local persistence + redirect return, then onAuthStateChanged
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        await ensureAuthPersistence();
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult?.user?.email) {
          console.log("Signed in via redirect:", redirectResult.user.email);
        }
      } catch (e) {
        console.error("Auth redirect / persistence bootstrap failed:", e);
      }
      if (cancelled) return;

      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (!userDoc.exists()) {
            const newUser = {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              role: 'viewer',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newUser);
            setUserRole('viewer');
          } else {
            setUserRole(userDoc.data().role);
          }
          setUser(currentUser);
        } else {
          setUser(null);
          setUserRole(null);
        }
        setIsAuthReady(true);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    // Sync Logs
    const qLogs = query(collection(db, 'workflowLogs'), orderBy('time', 'desc'), limit(50));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(newLogs.length > 0 ? newLogs : MOCK_LOGS);
    });

    // Sync Rules
    const qRules = query(collection(db, 'governanceRules'), orderBy('createdAt', 'desc'));
    const unsubscribeRules = onSnapshot(qRules, (snapshot) => {
      const newRules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as GovernanceRule[];
      setGovernanceRules(newRules);
    });

    return () => {
      unsubscribeLogs();
      unsubscribeRules();
    };
  }, [user]);

  useEffect(() => {
    if (activeTab !== "portfolio") return;
    let cancelled = false;
    (async () => {
      setPortfolioLoading(true);
      setPortfolioErr(null);
      try {
        const data = await fetchPortfolioEngagements();
        if (!cancelled) setPortfolioData({ engagements: data.engagements || [] });
      } catch (e: any) {
        if (!cancelled) setPortfolioErr(e?.message || "Portfolio load failed");
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Login failed:", error);
      setLoginError(error?.message || "Sign-in could not start. Check authorized domains in Firebase.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab('portfolio');
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const addWorkflowLog = async (log: any) => {
    if (!user || userRole === 'viewer') return;
    try {
      await addDoc(collection(db, 'workflowLogs'), {
        ...log,
        triggeredBy: user.email,
        time: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
    } catch (error) {
      console.error("Failed to add log:", error);
    }
  };

  const checkGovernanceRules = (metric: string, value: number) => {
    governanceRules.forEach(rule => {
      if (!rule.enabled || rule.metric.toLowerCase() !== metric.toLowerCase()) return;
      
      let breached = false;
      switch (rule.operator) {
        case '<': breached = value < rule.threshold; break;
        case '>': breached = value > rule.threshold; break;
        case '<=': breached = value <= rule.threshold; break;
        case '>=': breached = value >= rule.threshold; break;
        case '==': breached = value === rule.threshold; break;
      }
      
      if (breached) {
        setAgenticInsights(prev => [
          { 
            id: Date.now() + Math.random(), 
            type: 'risk', 
            title: `Governance Breach: ${rule.metric}`, 
            description: `Threshold ${rule.operator} ${rule.threshold} breached (Value: ${value.toFixed(2)}). Action: ${rule.action.replace(/_/g, ' ')}`, 
            severity: rule.severity || 'high', 
            status: 'pending' 
          },
          ...prev
        ]);
        
        // Also log the breach
        addWorkflowLog({
          source: "Governance Engine",
          action: "Rule Breach Detected",
          status: "Failed",
          result: `${rule.metric} value ${value.toFixed(2)} breached threshold ${rule.threshold} (Severity: ${rule.severity})`
        });
      }
    });
  };

  const addGovernanceRule = async (rule: Partial<GovernanceRule>) => {
    if (userRole !== 'admin') return;
    try {
      await addDoc(collection(db, 'governanceRules'), {
        ...rule,
        createdBy: user.email,
        createdAt: Timestamp.now(),
        enabled: true
      });
    } catch (error) {
      console.error("Failed to add rule:", error);
    }
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    if (userRole !== 'admin') return;
    try {
      await updateDoc(doc(db, 'governanceRules', id), { enabled });
    } catch (error) {
      console.error("Failed to toggle rule:", error);
    }
  };

  const deleteRule = async (id: string) => {
    if (userRole !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'governanceRules', id));
    } catch (error) {
      console.error("Failed to delete rule:", error);
    }
  };

  // Set up real-time webhooks via Socket.io
  useEffect(() => {
    const socket = io(SOCKET_URL || undefined); // Uses explicit backend URL in production

    socket.on('connect', () => {
      setSocketConnected(true);
      console.log('Connected to real-time webhook server');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('webhook_update', (newLog) => {
      addWorkflowLog(newLog);
      
      // Rule Engine Check
      if (newLog.result) {
        // Extract metrics from log result string (e.g. "CPI: 0.98, SPI: 1.02")
        const metrics = ['CPI', 'SPI', 'Compression', 'Health Score'];
        metrics.forEach(m => {
          if (newLog.result.includes(m)) {
            const regex = new RegExp(`${m}:\\s*([0-9.]+)`);
            const match = newLog.result.match(regex);
            if (match) {
              checkGovernanceRules(m, parseFloat(match[1]));
            }
          }
        });
      }

      // Update analyzed project name if ingestion was successful
      if (newLog.action === "File Ingestion" && newLog.status === "Success" && newLog.projectName) {
        setAnalyzedProject(newLog.projectName);
      }

      // Clear active task if it matches the log update
      setActiveTask(null);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // OneDrive Auth & File Fetching
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await apiFetch('/api/onedrive/status');
        const data = await res.json();
        setOneDriveConnected(data.connected);
        if (data.connected) {
          fetchFiles();
        }
      } catch (e) {
        console.error("Failed to check OneDrive status", e);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'onedrive') {
        setOneDriveConnected(true);
        fetchFiles();
      }
    };

    window.addEventListener('message', handleMessage);
    checkStatus();
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await apiFetch('/api/onedrive/files');
      if (res.ok) {
        const data = await res.json();
        setOneDriveFiles(data.files);
      } else if (res.status === 401) {
        setOneDriveConnected(false);
      }
    } catch (e) {
      console.error("Failed to fetch OneDrive files", e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleConnectOneDrive = async () => {
    try {
      const res = await apiFetch('/api/auth/onedrive/url');
      const { url } = await res.json();
      window.open(url, 'onedrive_auth', 'width=600,height=700');
    } catch (e) {
      console.error("Failed to get auth URL", e);
    }
  };

  const handleIngestFile = async (file: any) => {
    const projectName = projectNameInput || "Manual Ingestion";
    setIsIngesting(true);
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + Math.random() * 15, 90));
    }, 300);

    try {
      await fetch(apiUrl('/api/workflow/ingest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, fileName: file.name, projectName })
      });
      
      // Update logs
      const newLog = {
        id: Date.now(),
        time: new Date().toISOString().replace('T', ' ').split('.')[0],
        source: "OneDrive",
        projectName: projectName,
        action: "File Ingest",
        status: "Success",
        result: `Ingested: ${file.name}`,
        isPending: false
      };
      setLogs(prev => [newLog, ...prev]);
      
      setUploadProgress(100);
    } catch (e) {
      console.error("Ingestion failed", e);
      // Add failure log
      const errorLog = {
        id: Date.now(),
        time: new Date().toISOString().replace('T', ' ').split('.')[0],
        source: "OneDrive",
        projectName: projectName,
        action: "File Ingest",
        status: "Failed",
        result: "Ingestion Error",
        isPending: false
      };
      setLogs(prev => [errorLog, ...prev]);
    } finally {
      clearInterval(interval);
      setTimeout(() => {
        setIsIngesting(false);
        setUploadProgress(0);
      }, 800);
    }
  };

  const refreshIngestHistory = async () => {
    const projectName = projectNameInput || "Manual Ingestion";
    const projectSlug = slugifyProjectIdForUpload(projectName, "manual-ingest");
    setIngestHistoryLoading(true);
    try {
      const q = new URLSearchParams({
        clientId: manualIngestClientId.trim() || "default",
        projectId: projectSlug,
        limit: "20",
      });
      const res = await apiFetch(`/api/ingest/uploads?${q.toString()}`);
      const data = await res.json();
      setIngestUploadHistory(Array.isArray(data.uploads) ? data.uploads : []);
    } catch (e) {
      console.error("ingest history", e);
      setIngestUploadHistory([]);
    } finally {
      setIngestHistoryLoading(false);
    }
  };

  const processLocalFiles = async (files: File[]) => {
    const projectName = projectNameInput || "Manual Ingestion";
    const projectSlug = slugifyProjectIdForUpload(projectName, "manual-ingest");
    setIsIngesting(true);
    setUploadProgress(0);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectName', projectName);
        formData.append('clientId', manualIngestClientId.trim() || "default");
        formData.append('projectId', projectSlug);
        
        const up = await fetch(apiUrl('/api/workflow/upload'), {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        if (!up.ok) {
          const errText = await up.text().catch(() => up.statusText);
          throw new Error(errText || `Upload failed (${up.status})`);
        }
        
        // Update logs
        const newLog = {
          id: Date.now() + i,
          time: new Date().toISOString().replace('T', ' ').split('.')[0],
          source: "Local Upload",
          projectName: projectName,
          action: "File Ingest",
          status: "Success",
          result: `Ingested: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
          isPending: false
        };
        setLogs(prev => [newLog, ...prev]);
        
        setUploadProgress(((i + 1) / files.length) * 100);
      }
      await refreshIngestHistory();
      setActiveTab('logs');
    } catch (e) {
      console.error("Local upload failed", e);
      // Add failure log
      const errorLog = {
        id: Date.now(),
        time: new Date().toISOString().replace('T', ' ').split('.')[0],
        source: "Local Upload",
        projectName: projectName,
        action: "File Ingest",
        status: "Failed",
        result: "Upload Error",
        isPending: false
      };
      setLogs(prev => [errorLog, ...prev]);
    } finally {
      setTimeout(() => {
        setIsIngesting(false);
        setUploadProgress(0);
      }, 800);
    }
  };

  const handleLocalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingLocal(false);
    
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0) return;
    
    processLocalFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      processLocalFiles(Array.from(files) as File[]);
    }
  };

  const handleCancelTask = async () => {
    if (!activeTask) return;
    
    try {
      await fetch(apiUrl('/api/workflow/cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeTask)
      });
    } catch (e) {
      console.error("Cancellation failed", e);
    } finally {
      setIsSyncing(false);
      setIsAliceSimulating(false);
      setActiveTask(null);
    }
  };

  const triggerSync = async () => {
    // Validation check
    if (!p6Url || !p6Username || !p6Password || !acumenApiKey || !smartPmApiKey) {
      setValidationError("Missing API Credentials. Please complete the Configuration tab.");
      setActiveTab('config');
      return;
    }

    setValidationError(null);
    setIsSyncing(true);
    setActiveTask({ source: "Global Sync", action: "Manual Data Fetch" });
    try {
      const response = await fetch(apiUrl('/api/workflow/sync'), { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p6Type,
          p6Url,
          p6Username,
          p6Password,
          acumenApiKey,
          smartPmApiKey
        })
      });
      const data = await response.json();
      setLastSync(data);
      
      setAnalyticsMetrics(prev => {
        const updated = prev.map(m => ({
          ...m,
          spi: Math.max(0.8, Math.min(1.2, m.spi + (Math.random() - 0.5) * 0.05)),
          cpi: Math.max(0.8, Math.min(1.2, m.cpi + (Math.random() - 0.5) * 0.05)),
          variance: m.variance + (Math.random() - 0.5) * 2000
        }));
        
        // Check rules for the latest data point
        const latest = updated[updated.length - 1];
        if (latest) {
          checkGovernanceRules('SPI', latest.spi);
          checkGovernanceRules('CPI', latest.cpi);
        }
        
        return updated;
      });

      const newSmartPmMetrics = {
        compression: parseFloat((10 + Math.random() * 10).toFixed(1)),
        volatility: Math.random() > 0.5 ? 'Medium' : 'High',
        healthScore: Math.floor(75 + Math.random() * 20)
      };
      
      setSmartPmMetrics(newSmartPmMetrics);
      
      // Check rules for SmartPM metrics
      checkGovernanceRules('Compression', newSmartPmMetrics.compression);
      checkGovernanceRules('Health Score', newSmartPmMetrics.healthScore);
    } catch (error) {
      console.error('Sync failed', error);
      setValidationError("Sync failed. Check network or credentials.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTriggerAlice = async () => {
    if (!aliceApiKey) {
      setValidationError("Missing ALICE API Key. Please configure it first.");
      setActiveTab('config');
      return;
    }

    setValidationError(null);
    setIsAliceSimulating(true);
    setActiveTask({ source: "ALICE Technologies", action: "Simulation" });
    try {
      await fetch(apiUrl('/api/workflow/alice-simulate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: aliceDuration,
          optimizationGoal: aliceOptimizationGoal,
          constructionMethod: aliceConstructionMethod
        })
      });
      setActiveTab('logs');
    } catch (error) {
      console.error('ALICE simulation failed', error);
      setValidationError("ALICE simulation failed. Check network or credentials.");
    } finally {
      setIsAliceSimulating(false);
    }
  };

  const handleCheckP6Health = async () => {
    if (!p6Url || !p6Username || !p6Password) {
      setValidationError("Missing P6 API Credentials. Please complete the Configuration tab.");
      setActiveTab('config');
      return;
    }

    setIsCheckingP6Health(true);
    setP6HealthStatus('unknown');
    
    try {
      const response = await fetch(apiUrl('/api/workflow/p6-health'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p6Type,
          p6Url,
          p6Username,
          p6Password
        })
      });
      
      if (response.ok) {
        setP6HealthStatus('healthy');
        setP6LastHealthCheck(new Date().toISOString().replace('T', ' ').substring(0, 19));
      } else {
        setP6HealthStatus('error');
      }
    } catch (error) {
      console.error('P6 health check failed', error);
      setP6HealthStatus('error');
    } finally {
      setIsCheckingP6Health(false);
    }
  };

  const handleCheckJiraHealth = async () => {
    if (!jiraUrl || !jiraEmail || !jiraApiToken || !jiraProjectKey) {
      setValidationError("Missing Jira credentials. Please complete the configuration.");
      return;
    }

    setIsCheckingJiraHealth(true);
    setJiraHealthStatus('unknown');
    
    try {
      const response = await fetch(apiUrl('/api/jira/health'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraUrl,
          jiraEmail,
          jiraApiToken,
          jiraProjectKey
        })
      });
      
      if (response.ok) {
        setJiraHealthStatus('healthy');
      } else {
        setJiraHealthStatus('error');
      }
    } catch (error) {
      console.error('Jira health check failed', error);
      setJiraHealthStatus('error');
    } finally {
      setIsCheckingJiraHealth(false);
    }
  };

  const linkLogToJira = async (logId: string, issueKey: string) => {
    if (!user || userRole === 'viewer') return;
    try {
      // Update Firestore
      await updateDoc(doc(db, 'workflowLogs', logId), {
        jiraIssueKey: issueKey
      });

      // Notify backend
      await fetch(apiUrl('/api/jira/link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId,
          issueKey,
          summary: `Linked to Jira issue ${issueKey}`
        })
      });

      addWorkflowLog({
        source: "Jira",
        action: "Issue Linked",
        status: "Success",
        result: `Linked log ${logId} to ${issueKey}`
      });
      setIsLinkingJira(null);
    } catch (error) {
      console.error("Failed to link Jira issue:", error);
    }
  };

  const recalculateSchedule = (updatedTasks: ScheduleTask[]) => {
    // Simple topological sort / forward pass
    const sortedTasks = updatedTasks.map(t => ({ ...t }));
    const taskMap = new Map(sortedTasks.map(t => [t.id, t]));
    const processed = new Set<string>();
    
    // We need to process tasks whose dependencies are already processed
    let changed = true;
    let iterations = 0;
    const maxIterations = sortedTasks.length * 2; // Prevent infinite loops
    
    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;
      for (const task of sortedTasks) {
        if (processed.has(task.id)) continue;
        
        const deps = task.dependencies.map(id => taskMap.get(id)).filter(Boolean) as ScheduleTask[];
        if (deps.every(d => processed.has(d.id))) {
          // All dependencies processed, calculate start date
          if (deps.length > 0) {
            const latestFinish = deps.reduce((latest, d) => {
              const finish = addDays(parseISO(d.startDate), d.duration);
              return isAfter(finish, latest) ? finish : latest;
            }, parseISO(task.startDate));
            
            const newStart = format(latestFinish, 'yyyy-MM-dd');
            if (newStart !== task.startDate) {
              task.startDate = newStart;
              changed = true;
            }
          }
          processed.add(task.id);
        }
      }
    }
    return sortedTasks;
  };

  const updateTask = (id: string, updates: Partial<ScheduleTask>) => {
    const newTasks = tasks.map(t => t.id === id ? { ...t, ...updates } : t);
    const recalculated = recalculateSchedule(newTasks);
    setTasks(recalculated);
  };

  const addTask = () => {
    const newId = (tasks.length > 0 ? Math.max(...tasks.map(t => parseInt(t.id))) + 1 : 1).toString();
    const newTask: ScheduleTask = {
      id: newId,
      name: 'New Task',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      duration: 5,
      dependencies: [],
      type: 'task'
    };
    setTasks([...tasks, newTask]);
  };

  const deleteTask = (id: string) => {
    const newTasks = tasks.filter(t => t.id !== id).map(t => ({
      ...t,
      dependencies: t.dependencies.filter(depId => depId !== id)
    }));
    setTasks(recalculateSchedule(newTasks));
  };

  const handleExportCSV = () => {
    const headers = ["Timestamp", "Source", "Project", "Action", "Status", "Result"];
    const csvContent = [
      headers.join(","),
      ...logs.map(log => 
        `"${log.time}","${log.source}","${log.projectName || "N/A"}","${log.action}","${log.status}","${log.result}"`
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `workflow_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
          <span className="text-[10px] uppercase tracking-widest opacity-40">Initializing Governance...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-[#141414] bg-white p-12 shadow-2xl">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="w-16 h-16 border border-[#141414] flex items-center justify-center">
              <Shield className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="font-serif italic text-3xl">Project Governance</h1>
              <p className="text-xs font-mono opacity-60 uppercase tracking-widest">Automated Compliance & Risk Management</p>
            </div>
            <button
              type="button"
              onClick={handleLogin}
              className="w-full py-4 bg-[#141414] text-[#E4E3E0] font-mono text-xs uppercase tracking-[0.2em] font-bold hover:bg-black transition-all flex items-center justify-center gap-3"
            >
              <User className="w-4 h-4" />
              Continue with Google
            </button>
            <p className="text-[9px] font-mono opacity-50 leading-relaxed">
              You will be redirected to Google, then return here. Works reliably in Chrome (no popup blocker).
            </p>
            {loginError && (
              <p className="text-[10px] font-mono text-red-600 text-center">{loginError}</p>
            )}
            <p className="text-[10px] font-mono opacity-40 leading-relaxed">
              Access restricted to authorized personnel. All actions are logged for audit purposes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 h-full w-64 border-r border-[#141414] bg-[#E4E3E0] z-20 hidden md:block">
        <div className="p-6 border-bottom border-[#141414]">
          <div className="flex items-center gap-3 mb-8">
            <ShieldCheck className="w-8 h-8" />
            <h1 className="font-serif italic text-xl font-bold tracking-tight">Governance</h1>
          </div>
          
          <nav className="space-y-1">
            <NavItem 
              icon={<LayoutDashboard className="w-4 h-4" />} 
              label="Command Center" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
            />
            <NavItem 
              icon={<LayoutGrid className="w-4 h-4" />} 
              label="Portfolio" 
              active={activeTab === 'portfolio'} 
              onClick={() => setActiveTab('portfolio')}
            />
            <NavItem 
              icon={<BarChart3 className="w-4 h-4" />} 
              label="Project Analytics" 
              active={activeTab === 'analytics'} 
              onClick={() => setActiveTab('analytics')}
            />
            <NavItem 
              icon={<Clock className="w-4 h-4" />} 
              label="Schedule Engine" 
              active={activeTab === 'schedule'} 
              onClick={() => setActiveTab('schedule')}
            />
            <NavItem 
              icon={<Activity className="w-4 h-4" />} 
              label="Predictive Risk" 
              active={activeTab === 'predict'} 
              onClick={() => setActiveTab('predict')}
            />
            <NavItem 
              icon={<RefreshCw className="w-4 h-4" />} 
              label="Recovery Planner" 
              active={activeTab === 'optimize'} 
              onClick={() => setActiveTab('optimize')}
            />
            <NavItem 
              icon={<FolderOpen className="w-4 h-4" />} 
              label="Filing Cabinet" 
              active={activeTab === 'cabinet'} 
              onClick={() => setActiveTab('cabinet')}
            />
            <NavItem 
              icon={<FileText className="w-4 h-4" />} 
              label="Workflow Logs" 
              active={activeTab === 'logs'} 
              onClick={() => setActiveTab('logs')}
            />
            <NavItem 
              icon={<Database className="w-4 h-4" />} 
              label="Data Sources" 
              active={activeTab === 'sources'} 
              onClick={() => setActiveTab('sources')}
            />
            <div className="my-4 border-t border-[#141414]/10" />
            <NavItem 
              icon={<Settings className="w-4 h-4" />} 
              label="Integrations" 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')}
            />
            <div className="my-4 border-t border-[#141414]/10" />
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-mono uppercase tracking-widest opacity-60 hover:opacity-100 hover:bg-[#141414]/5 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </nav>
        </div>

        <div className="absolute bottom-0 w-full p-6 border-t border-[#141414]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full border border-[#141414] overflow-hidden">
              <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold truncate max-w-[120px]">{user.displayName}</span>
              <span className="text-[8px] font-mono uppercase opacity-50 flex items-center gap-1">
                <Lock className="w-2 h-2" /> {userRole}
              </span>
            </div>
          </div>
          <div className="text-[10px] font-mono opacity-50 uppercase tracking-widest flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", socketConnected ? "bg-emerald-500" : "bg-red-500")} />
            {socketConnected ? "Webhooks Active" : "Webhooks Offline"}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-64 p-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="text-[11px] font-mono opacity-50 uppercase tracking-[0.2em] mb-2">
              Agentic Command Center
            </div>
            <h2 className="text-5xl font-serif italic font-bold tracking-tighter">
              Project Integrity <span className="text-2xl not-italic opacity-30">v2.4</span>
            </h2>
            {analyzedProject && (
              <div className="mt-2 flex items-center gap-2 text-emerald-600 font-mono text-[10px] uppercase tracking-widest">
                <FileCode className="w-3 h-3" />
                Analyzed: {analyzedProject}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {validationError && (
              <div className="flex items-center gap-2 text-red-600 font-mono text-[10px] uppercase tracking-widest animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                {validationError}
              </div>
            )}
            <button 
              onClick={isSyncing ? handleCancelTask : triggerSync}
              disabled={(!p6Url || !p6Username || !p6Password || !acumenApiKey || !smartPmApiKey) && !isSyncing}
              className={cn(
                "flex items-center gap-3 px-6 py-3 border border-[#141414] transition-all duration-300",
                isSyncing 
                  ? "bg-red-50 text-red-600 border-red-600 hover:bg-red-600 hover:text-white" 
                  : "hover:bg-[#141414] hover:text-[#E4E3E0]",
                (!p6Url || !p6Username || !p6Password || !acumenApiKey || !smartPmApiKey) && !isSyncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
              <span className="font-mono text-xs uppercase tracking-widest">
                {isSyncing ? "Cancel Sync" : "Trigger Global Sync"}
              </span>
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in duration-500">
            {/* AI Readiness Checklist */}
            <div className="mb-12 border border-[#141414] bg-[#141414] text-[#E4E3E0] p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 border border-white/20 flex items-center justify-center">
                  <Cpu className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-serif italic text-2xl">AI Agent Activation Guide</h3>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">Follow these steps to enable autonomous project governance</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono",
                      (p6Url && p6Username) ? "bg-emerald-500 border-emerald-500 text-white" : "border-white/20 text-white/40"
                    )}>
                      {(p6Url && p6Username) ? <Check className="w-3 h-3" /> : "01"}
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-widest">Connect Core Data</span>
                  </div>
                  <p className="text-[11px] opacity-60 leading-relaxed font-mono pl-9">
                    Link your Primavera P6 environment in the <button onClick={() => setActiveTab('settings')} className="underline hover:text-emerald-400">Integrations</button> tab to provide the AI with schedule context.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono",
                      (aliceApiKey || smartPmApiKey) ? "bg-emerald-500 border-emerald-500 text-white" : "border-white/20 text-white/40"
                    )}>
                      {(aliceApiKey || smartPmApiKey) ? <Check className="w-3 h-3" /> : "02"}
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-widest">Enable AI Engines</span>
                  </div>
                  <p className="text-[11px] opacity-60 leading-relaxed font-mono pl-9">
                    Provide API keys for ALICE (Simulation) or SmartPM (Analytics) to unlock predictive insights and recovery planning.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono",
                      governanceRules.length > 0 ? "bg-emerald-500 border-emerald-500 text-white" : "border-white/20 text-white/40"
                    )}>
                      {governanceRules.length > 0 ? <Check className="w-3 h-3" /> : "03"}
                    </div>
                    <span className="font-mono text-[11px] uppercase tracking-widest">Define Governance</span>
                  </div>
                  <p className="text-[11px] opacity-60 leading-relaxed font-mono pl-9">
                    Configure thresholds in the <button onClick={() => setActiveTab('rules')} className="underline hover:text-emerald-400">Governance Rules</button> tab to trigger autonomous agent interventions.
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[#141414] border border-[#141414] mb-12">
              <StatCard 
                label="Schedule Quality" 
                value={lastSync ? `${lastSync.metrics.scheduleQuality}%` : "91%"} 
                trend="+2.4%" 
                icon={<BarChart3 className="w-4 h-4" />}
              />
              <StatCard 
                label="Cost Performance (CPI)" 
                value={lastSync ? lastSync.metrics.costPerformanceIndex : "0.98"} 
                trend={lastSync ? (parseFloat(lastSync.metrics.costPerformanceIndex) >= 1 ? "Under Budget" : "Over Budget") : "Under Budget"} 
                icon={<Activity className="w-4 h-4 text-emerald-600" />}
              />
              <StatCard 
                label="Schedule Index (SPI)" 
                value={lastSync ? lastSync.metrics.schedulePerformanceIndex : "1.02"} 
                trend="Stable" 
                icon={<Clock className="w-4 h-4" />}
              />
              <StatCard 
                label="Budget Variance" 
                value={lastSync ? `$${(lastSync.metrics.budgetVariance / 1000).toFixed(1)}k` : "$12.4k"} 
                trend="Success" 
                icon={<Database className="w-4 h-4" />}
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-12">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between border-b border-[#141414] pb-4">
                  <h3 className="font-serif italic text-xl">Quality vs Risk Trend</h3>
                  <div className="flex gap-4 font-mono text-[10px] uppercase tracking-widest">
                    <span className="flex items-center gap-2"><div className="w-2 h-2 bg-[#141414]" /> Quality</span>
                    <span className="flex items-center gap-2"><div className="w-2 h-2 bg-orange-500" /> Risk</span>
                  </div>
                </div>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={MOCK_HISTORY}>
                      <defs>
                        <linearGradient id="colorQuality" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#141414" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#141414" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#141414" strokeOpacity={0.1} />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 10, fontFamily: 'monospace'}} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fontSize: 10, fontFamily: 'monospace'}} 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#E4E3E0', border: '1px solid #141414', borderRadius: 0 }}
                        itemStyle={{ fontSize: 12, fontFamily: 'monospace' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="quality" 
                        stroke="#141414" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorQuality)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="risk" 
                        stroke="#f97316" 
                        strokeWidth={2} 
                        fill="transparent" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Agentic Insights / Action Queue */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-[#141414] pb-4">
                  <h3 className="font-serif italic text-xl">Action Queue</h3>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setAgenticInsights(prev => [
                          { 
                            id: Date.now(), 
                            type: 'risk', 
                            title: 'Simulated AI Discovery', 
                            description: 'AI Agent has identified a potential schedule bottleneck in the foundation phase. Suggested action: Parallelize excavation.', 
                            severity: 'medium', 
                            status: 'pending' 
                          },
                          ...prev
                        ]);
                      }}
                      className="text-[9px] font-mono uppercase tracking-widest border border-[#141414]/20 px-2 py-0.5 hover:bg-[#141414] hover:text-white transition-all"
                    >
                      Simulate Insight
                    </button>
                    <div className="text-[9px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-2 py-0.5">
                      AI Agent Active
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {agenticInsights.map((insight) => (
                    <div 
                      key={insight.id} 
                      className={cn(
                        "p-4 border border-[#141414] bg-white relative overflow-hidden group transition-all hover:shadow-md",
                        insight.status === 'resolved' && "opacity-50"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0 left-0 w-1 h-full",
                        insight.severity === 'high' ? "bg-red-500" : insight.severity === 'medium' ? "bg-orange-500" : "bg-emerald-500"
                      )} />
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest opacity-50">{insight.type}</span>
                        {insight.status === 'pending' && (
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                      <h4 className="font-mono text-[11px] font-bold uppercase tracking-tight mb-2">{insight.title}</h4>
                      <p className="text-[11px] opacity-70 leading-relaxed mb-4">{insight.description}</p>
                      <div className="flex gap-2">
                        <button className="px-3 py-1 bg-[#141414] text-white font-mono text-[9px] uppercase tracking-widest hover:bg-black transition-colors">
                          Execute
                        </button>
                        <button className="px-3 py-1 border border-[#141414] font-mono text-[9px] uppercase tracking-widest hover:bg-[#141414]/5 transition-colors">
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setActiveTab('predict')}
                  className="w-full p-3 border border-dashed border-[#141414]/30 font-mono text-[10px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                >
                  View All Insights
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "portfolio" && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#141414] pb-4">
              <div>
                <h3 className="font-serif italic text-3xl">Multi-Client Portfolio</h3>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50 mt-2">
                  Schedule health from Firestore (XER ingest) — BIR™ and TRIAGE-IMPACT™ via Claude Sonnet
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setPortfolioLoading(true);
                  setPortfolioErr(null);
                  try {
                    const data = await fetchPortfolioEngagements();
                    setPortfolioData({ engagements: data.engagements || [] });
                  } catch (e: any) {
                    setPortfolioErr(e?.message || "Refresh failed");
                  } finally {
                    setPortfolioLoading(false);
                  }
                }}
                className="px-4 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
              >
                {portfolioLoading ? "Loading…" : "Refresh data"}
              </button>
            </div>

            {portfolioErr && (
              <div className="p-4 border border-red-300 bg-red-50 text-red-800 font-mono text-xs">{portfolioErr}</div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="xl:col-span-2 border border-[#141414] bg-white overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-[#141414] bg-[#141414]/5 uppercase tracking-widest text-[9px]">
                      <th className="p-3">Client</th>
                      <th className="p-3">Project</th>
                      <th className="p-3">SQI</th>
                      <th className="p-3">SPI</th>
                      <th className="p-3">CPI</th>
                      <th className="p-3">Acts</th>
                      <th className="p-3">Crit</th>
                      <th className="p-3">Ingested</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!portfolioData?.engagements?.length ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center opacity-50 italic font-serif text-sm">
                          {portfolioLoading ? "Loading engagements…" : "No projects in Firestore yet — upload a XER from Filing Cabinet."}
                        </td>
                      </tr>
                    ) : (
                      portfolioData.engagements.map((row: any) => {
                        const h = row.health || {};
                        const selected =
                          selectedEngagement?.clientId === row.clientId && selectedEngagement?.projectId === row.projectId;
                        const sq = h.qualityScore;
                        const sqClass =
                          sq == null ? "" : sq < 65 ? "text-red-600 font-bold" : sq < 80 ? "text-amber-700" : "text-emerald-700";
                        return (
                          <tr
                            key={`${row.clientId}-${row.projectId}`}
                            onClick={() => {
                              setSelectedEngagement(row);
                              setMethodologyOutput(null);
                              setMethodologyMeta(null);
                            }}
                            className={cn(
                              "border-b border-[#141414]/10 cursor-pointer hover:bg-[#141414]/5",
                              selected && "bg-emerald-50"
                            )}
                          >
                            <td className="p-3 font-bold">{row.clientLabel || row.clientId}</td>
                            <td className="p-3">{row.projectName}</td>
                            <td className={cn("p-3", sqClass)}>{h.qualityScore ?? "—"}</td>
                            <td className="p-3">{h.spi ?? "—"}</td>
                            <td className="p-3">{h.cpi ?? "—"}</td>
                            <td className="p-3">{h.totalActivities ?? "—"}</td>
                            <td className="p-3">{h.criticalActivities ?? "—"}</td>
                            <td className="p-3 text-[9px] opacity-70 max-w-[120px] truncate" title={row.ingestedAt}>
                              {row.ingestedAt ? String(row.ingestedAt).slice(0, 16) : "—"}
                            </td>
                            <td className="p-3 text-[9px] uppercase">{row.engagementStatus || "active"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <div className="border border-[#141414] bg-[#141414] text-[#E4E3E0] p-6">
                  <h4 className="font-serif italic text-lg mb-2">Methodology</h4>
                  <p className="font-mono text-[9px] uppercase tracking-widest opacity-60 leading-relaxed">
                    Select a row, then run BIR™ (bid schedule intelligence) or TRIAGE-IMPACT™ (TIA-style narrative). Model:{" "}
                    <code className="text-emerald-400">claude-sonnet-4-20250514</code>
                  </p>
                  {!selectedEngagement ? (
                    <p className="mt-4 font-mono text-[10px] opacity-50">No row selected.</p>
                  ) : (
                    <div className="mt-4 space-y-2 font-mono text-[10px]">
                      <div>
                        <span className="opacity-50">Client:</span> {selectedEngagement.clientId}
                      </div>
                      <div>
                        <span className="opacity-50">Project id:</span> {selectedEngagement.projectId}
                      </div>
                      <div className="flex flex-col gap-2 pt-2">
                        <button
                          type="button"
                          disabled={birRunning}
                          onClick={async () => {
                            setBirRunning(true);
                            setMethodologyOutput(null);
                            setMethodologyMeta(null);
                            try {
                              const r = await runBirAnalysis({
                                clientId: selectedEngagement.clientId,
                                projectId: selectedEngagement.projectId,
                                clientContext: `Portfolio engagement: ${selectedEngagement.clientLabel || selectedEngagement.clientId} — ${selectedEngagement.projectName}`,
                              });
                              setMethodologyOutput(r.analysis);
                              setMethodologyMeta(`${r.methodology} · ${r.model}`);
                            } catch (e: any) {
                              setMethodologyOutput(`**Error:** ${e?.message || e}`);
                            } finally {
                              setBirRunning(false);
                            }
                          }}
                          className="w-full py-2 bg-emerald-600 text-white uppercase tracking-widest text-[9px] hover:bg-emerald-500 disabled:opacity-40"
                        >
                          {birRunning ? "Running BIR™…" : "Run BIR™ analysis"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border border-[#141414] bg-white p-6 space-y-3">
                  <h4 className="font-mono text-[10px] uppercase tracking-widest font-bold">TRIAGE-IMPACT™ inputs</h4>
                  <label className="block text-[9px] font-mono uppercase opacity-50">Impacting events (one per line)</label>
                  <textarea
                    value={triageEventsText}
                    onChange={(e) => setTriageEventsText(e.target.value)}
                    rows={5}
                    className="w-full p-2 border border-[#141414] font-mono text-[10px] bg-transparent"
                  />
                  <label className="block text-[9px] font-mono uppercase opacity-50">Owner narrative (optional)</label>
                  <textarea
                    value={triageOwnerNotes}
                    onChange={(e) => setTriageOwnerNotes(e.target.value)}
                    rows={3}
                    placeholder="Context for CO / delay dialogue…"
                    className="w-full p-2 border border-[#141414] font-mono text-[10px] bg-transparent"
                  />
                  <button
                    type="button"
                    disabled={triageRunning || !selectedEngagement}
                    onClick={async () => {
                      if (!selectedEngagement) return;
                      const events = parseTriageEventsLines(triageEventsText);
                      if (!events.length) {
                        setMethodologyOutput("**Error:** Add at least one impacting event line.");
                        return;
                      }
                      setTriageRunning(true);
                      setMethodologyOutput(null);
                      setMethodologyMeta(null);
                      try {
                        const scheduleFacts = {
                          ...(selectedEngagement.summarySnapshot && typeof selectedEngagement.summarySnapshot === "object"
                            ? selectedEngagement.summarySnapshot
                            : {}),
                          dataDate: selectedEngagement.dataDate,
                          ingestedAt: selectedEngagement.ingestedAt,
                          sourceFile: selectedEngagement.sourceFile,
                          portfolioHealth: selectedEngagement.health,
                        };
                        const r = await runTriageImpactReport({
                          projectName: selectedEngagement.projectName,
                          scheduleFacts,
                          impactingEvents: events,
                          ownerNarrative: triageOwnerNotes.trim() || undefined,
                          analysisWindow: selectedEngagement.dataDate
                            ? { end: String(selectedEngagement.dataDate) }
                            : undefined,
                        });
                        setMethodologyOutput(r.report);
                        setMethodologyMeta(`${r.methodology} · ${r.model}`);
                      } catch (e: any) {
                        setMethodologyOutput(`**Error:** ${e?.message || e}`);
                      } finally {
                        setTriageRunning(false);
                      }
                    }}
                    className="w-full py-2 border border-[#141414] font-mono text-[9px] uppercase tracking-widest hover:bg-[#141414] hover:text-white disabled:opacity-40"
                  >
                    {triageRunning ? "Generating report…" : "Generate TRIAGE-IMPACT™ report"}
                  </button>
                </div>

                {methodologyOutput && (
                  <div className="border border-[#141414] bg-white p-4 max-h-[480px] overflow-y-auto">
                    {methodologyMeta && (
                      <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-700 mb-2 border-b border-[#141414]/10 pb-2">
                        {methodologyMeta}
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[#141414]">
                      {methodologyOutput}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Integrations Section */}
        {activeTab === 'settings' && (
          <section className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* AI System Health Overview */}
            <div className="border border-[#141414] bg-[#141414] text-[#E4E3E0] p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <Activity className="w-6 h-6 text-emerald-400" />
                  <h3 className="font-serif italic text-2xl">AI Agent System Health</h3>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-50">
                  Real-time Status Monitor
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="p-4 bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest opacity-50">P6 Connection</span>
                    <div className={cn("w-2 h-2 rounded-full", p6HealthStatus === 'healthy' ? "bg-emerald-500" : "bg-red-500")} />
                  </div>
                  <div className="font-serif italic text-lg">{p6HealthStatus === 'healthy' ? "Connected" : "Offline"}</div>
                </div>
                <div className="p-4 bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest opacity-50">ALICE Engine</span>
                    <div className={cn("w-2 h-2 rounded-full", aliceApiKey ? "bg-emerald-500" : "bg-white/20")} />
                  </div>
                  <div className="font-serif italic text-lg">{aliceApiKey ? "Active" : "Disabled"}</div>
                </div>
                <div className="p-4 bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest opacity-50">SmartPM Sync</span>
                    <div className={cn("w-2 h-2 rounded-full", smartPmApiKey ? "bg-emerald-500" : "bg-white/20")} />
                  </div>
                  <div className="font-serif italic text-lg">{smartPmApiKey ? "Active" : "Disabled"}</div>
                </div>
                <div className="p-4 bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest opacity-50">Governance Rules</span>
                    <div className={cn("w-2 h-2 rounded-full", governanceRules.length > 0 ? "bg-emerald-500" : "bg-white/20")} />
                  </div>
                  <div className="font-serif italic text-lg">{governanceRules.length > 0 ? `${governanceRules.length} Active` : "None"}</div>
                </div>
                <div className="p-4 bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest opacity-50">Jira Traceability</span>
                    <div className={cn("w-2 h-2 rounded-full", jiraHealthStatus === 'healthy' ? "bg-emerald-500" : "bg-white/20")} />
                  </div>
                  <div className="font-serif italic text-lg">{jiraHealthStatus === 'healthy' ? "Active" : "Disabled"}</div>
                </div>
              </div>
            </div>

            {/* Local Agent Download Card */}
            <div className="border border-[#141414] bg-white p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Cpu className="w-6 h-6 text-[#141414]" />
                  <h3 className="font-serif italic text-2xl">Acumen Fuse Local Agent</h3>
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-2 py-1">
                  Desktop Bridge
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="flex-grow">
                  <p className="font-mono text-xs leading-relaxed opacity-70 mb-4">
                    If you are using a local installation of Deltek Acumen Fuse, you must run the Local Gateway Agent to bridge your desktop data with this cloud dashboard.
                  </p>
                  <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest opacity-50">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Secure Tunneling</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Zero Dependency</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-300" /> Real-time Sync</span>
                  </div>
                </div>
                <button 
                  onClick={handleDownloadAgent}
                  className="flex items-center justify-center gap-3 px-8 py-4 bg-[#141414] text-[#E4E3E0] font-mono text-xs uppercase tracking-[0.2em] font-bold hover:bg-black transition-all shadow-lg group"
                >
                  <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  Download acumen-agent.ps1
                </button>
              </div>
            </div>

            {/* API Credentials */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="border border-[#141414] bg-white p-8">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="font-serif italic text-2xl">Primavera P6 (Azure Hosted)</h3>
                  <div className="text-[10px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-2 py-1">
                    Webhook Ready
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                      P6 Environment Type
                    </label>
                    <select 
                      value={p6Type}
                      onChange={(e) => setP6Type(e.target.value)}
                      className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]"
                    >
                      <option value="eppm">P6 EPPM</option>
                      <option value="pro">P6 Professional (23.12+)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                      Base URL {!p6Url && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      type="text" 
                      value={p6Url}
                      onChange={(e) => {
                        setP6Url(e.target.value);
                        if (e.target.value) setValidationError(null);
                      }}
                      placeholder="e.g. https://p6.azure.yourcompany.com"
                      className={cn(
                        "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]",
                        !p6Url ? "border-red-200" : "border-[#141414]"
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                      Username {!p6Username && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      type="text" 
                      value={p6Username}
                      onChange={(e) => {
                        setP6Username(e.target.value);
                        if (e.target.value) setValidationError(null);
                      }}
                      placeholder="API Integration User"
                      className={cn(
                        "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]",
                        !p6Username ? "border-red-200" : "border-[#141414]"
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                      Password {!p6Password && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      type="password" 
                      value={p6Password}
                      onChange={(e) => {
                        setP6Password(e.target.value);
                        if (e.target.value) setValidationError(null);
                      }}
                      placeholder="••••••••••••••••"
                      className={cn(
                        "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]",
                        !p6Password ? "border-red-200" : "border-[#141414]"
                      )}
                    />
                  </div>
                  <div className="p-4 bg-[#141414]/5 border border-dashed border-[#141414]/20 mt-4">
                    <div className="flex items-center gap-2 text-[#141414] mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Required API Permissions</span>
                    </div>
                    <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                      The integration account must have the following Oracle Primavera Cloud API privileges enabled:
                    </p>
                    <ul className="list-disc list-inside text-[11px] opacity-70 leading-relaxed font-mono mt-2 space-y-1">
                      <li><strong>Project Read:</strong> Required to fetch WBS, Activities, and Logic.</li>
                      <li><strong>Cost Read:</strong> Required to fetch Budget, Actuals, and Forecasts.</li>
                      <li><strong>Resource Read:</strong> Required to fetch Resource Assignments.</li>
                    </ul>
                  </div>

                  <div className="pt-6">
                    <button 
                      onClick={handleCheckP6Health}
                      disabled={isCheckingP6Health || !p6Url || !p6Username || !p6Password}
                      className="w-full p-4 bg-[#141414] text-[#E4E3E0] font-mono text-xs uppercase tracking-[0.2em] font-bold hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
                    >
                      {isCheckingP6Health ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying Connection...</>
                      ) : (
                        <><Database className="w-4 h-4" /> Test P6 Connection</>
                      )}
                    </button>
                    {p6HealthStatus !== 'unknown' && !isCheckingP6Health && (
                      <div className={cn(
                        "mt-4 p-3 border font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 animate-in fade-in slide-in-from-top-2",
                        p6HealthStatus === 'healthy' ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-red-50 border-red-500 text-red-700"
                      )}>
                        {p6HealthStatus === 'healthy' ? (
                          <><CheckCircle2 className="w-3 h-3" /> Connection Verified Successfully</>
                        ) : (
                          <><AlertTriangle className="w-3 h-3" /> Connection Failed. Check Credentials.</>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border border-[#141414] bg-white p-8">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="font-serif italic text-2xl">Acumen Fuse / Deltek</h3>
                  <div className="text-[10px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-2 py-1">
                    Webhook Ready
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                      Deployment Type
                    </label>
                    <select 
                      value={acumenDeploymentType}
                      onChange={(e) => setAcumenDeploymentType(e.target.value)}
                      className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]"
                    >
                      <option value="cloud">Deltek Cloud (API)</option>
                      <option value="local">Local Desktop Installation</option>
                    </select>
                  </div>

                  {acumenDeploymentType === 'cloud' ? (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50">
                            API Key {!acumenApiKey && <span className="text-red-500">*</span>}
                          </label>
                          <a 
                            href="https://cloud.deltek.com/" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] font-mono uppercase tracking-widest text-blue-600 hover:underline flex items-center gap-1"
                          >
                            Get Key <ExternalLink className="w-2 h-2" />
                          </a>
                        </div>
                        <input 
                          type="password" 
                          value={acumenApiKey}
                          onChange={(e) => {
                            setAcumenApiKey(e.target.value);
                            if (e.target.value) setValidationError(null);
                          }}
                          placeholder="Enter Acumen API Key"
                          className={cn(
                            "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]",
                            !acumenApiKey ? "border-red-200" : "border-[#141414]"
                          )}
                        />
                      </div>
                      <div className="p-4 bg-[#141414]/5 border border-dashed border-[#141414]/20 mt-4">
                        <div className="flex items-center gap-2 text-[#141414] mb-2">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Required API Permissions</span>
                        </div>
                        <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                          The integration account must have the following Deltek Acumen API privileges enabled:
                        </p>
                        <ul className="list-disc list-inside text-[11px] opacity-70 leading-relaxed font-mono mt-2 space-y-1">
                          <li><strong>Project Read/Write:</strong> Required to ingest new P6 snapshots.</li>
                          <li><strong>Analysis Read:</strong> Required to fetch schedule quality scores and metrics.</li>
                        </ul>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-5 bg-white border border-[#141414] mt-4 shadow-sm">
                        <div className="flex items-center gap-2 text-[#141414] mb-4 border-b border-[#141414]/10 pb-3">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span className="font-mono text-[11px] uppercase tracking-widest font-bold">Local Connection Setup</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Step 1 */}
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#141414] text-white font-mono text-[10px] font-bold">1</span>
                              <h5 className="font-mono text-[10px] uppercase tracking-widest font-bold">Run Agent</h5>
                            </div>
                            <p className="text-[11px] opacity-70 leading-relaxed font-mono mb-3 flex-grow">
                              Download and right-click &rarr; "Run with PowerShell" to start the local listener.
                            </p>
                            <button 
                              onClick={handleDownloadAgent}
                              className="flex items-center justify-center gap-2 w-full px-3 py-2 border border-[#141414] text-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-white transition-colors"
                            >
                              <Download className="w-3 h-3" />
                              acumen-agent.ps1
                            </button>
                          </div>

                          {/* Step 2 */}
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#141414] text-white font-mono text-[10px] font-bold">2</span>
                              <h5 className="font-mono text-[10px] uppercase tracking-widest font-bold">Start Tunnel</h5>
                            </div>
                            <p className="text-[11px] opacity-70 leading-relaxed font-mono mb-3 flex-grow">
                              Expose the agent to the internet using ngrok in a new terminal window.
                            </p>
                            <div className="bg-[#141414] text-emerald-400 p-2 text-[11px] font-mono flex items-center gap-2">
                              <span className="opacity-50">$</span> ngrok http 8080
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#141414] text-white font-mono text-[10px] font-bold">3</span>
                              <h5 className="font-mono text-[10px] uppercase tracking-widest font-bold">Connect</h5>
                            </div>
                            <p className="text-[11px] opacity-70 leading-relaxed font-mono mb-3 flex-grow">
                              Paste the generated ngrok URL here to link the cloud app to your desktop.
                            </p>
                            <input 
                              type="text" 
                              value={acumenLocalUrl}
                              onChange={(e) => {
                                setAcumenLocalUrl(e.target.value);
                                if (e.target.value) setValidationError(null);
                              }}
                              placeholder="https://*.ngrok.app"
                              className={cn(
                                "w-full p-2 border font-mono text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#141414]",
                                !acumenLocalUrl ? "border-red-400" : "border-[#141414]"
                              )}
                            />
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-[#141414]/10">
                          <div className="flex items-start gap-2 text-amber-700">
                            <AlertTriangle className="w-3 h-3 mt-0.5" />
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono uppercase tracking-widest font-bold">Configuration Note</p>
                              <p className="text-[10px] font-mono opacity-80 leading-relaxed">
                                Ensure the <code className="bg-amber-50 px-1">$AcumenCliPath</code> variable in the agent script matches your local installation path. If you encounter permission errors, run the PowerShell terminal as <strong>Administrator</strong>.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="p-4 bg-[#141414]/5 border border-dashed border-[#141414]/20">
                    <p className="text-[10px] font-mono opacity-70 leading-relaxed">
                      Required for schedule quality analysis and ingestion into Acumen Fuse projects.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-[#141414] bg-white p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <Kanban className="w-6 h-6 text-[#141414]" />
                    <h3 className="font-serif italic text-2xl">Jira Software</h3>
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-2 py-1">
                    API Ready
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                      Jira Instance URL {!jiraUrl && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      type="text" 
                      value={jiraUrl}
                      onChange={(e) => setJiraUrl(e.target.value)}
                      placeholder="e.g. https://your-company.atlassian.net"
                      className={cn(
                        "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]",
                        !jiraUrl ? "border-red-200" : "border-[#141414]"
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                        Admin Email {!jiraEmail && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        type="email" 
                        value={jiraEmail}
                        onChange={(e) => setJiraEmail(e.target.value)}
                        placeholder="user@company.com"
                        className={cn(
                          "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]",
                          !jiraEmail ? "border-red-200" : "border-[#141414]"
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                        API Token {!jiraApiToken && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        type="password" 
                        value={jiraApiToken}
                        onChange={(e) => setJiraApiToken(e.target.value)}
                        placeholder="••••••••••••••••"
                        className={cn(
                          "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]",
                          !jiraApiToken ? "border-red-200" : "border-[#141414]"
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                      Default Project Key
                    </label>
                    <input 
                      type="text" 
                      value={jiraProjectKey}
                      onChange={(e) => setJiraProjectKey(e.target.value)}
                      placeholder="e.g. PROJ"
                      className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  
                  <div className="pt-6">
                    <button 
                      onClick={handleCheckJiraHealth}
                      disabled={isCheckingJiraHealth || !jiraUrl || !jiraEmail || !jiraApiToken}
                      className="w-full p-4 bg-[#141414] text-[#E4E3E0] font-mono text-xs uppercase tracking-[0.2em] font-bold hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
                    >
                      {isCheckingJiraHealth ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying Connection...</>
                      ) : (
                        <><Kanban className="w-4 h-4" /> Test Jira Connection</>
                      )}
                    </button>
                    {jiraHealthStatus !== 'unknown' && !isCheckingJiraHealth && (
                      <div className={cn(
                        "mt-4 p-3 border font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 animate-in fade-in slide-in-from-top-2",
                        jiraHealthStatus === 'healthy' ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-red-50 border-red-500 text-red-700"
                      )}>
                        {jiraHealthStatus === 'healthy' ? (
                          <><CheckCircle2 className="w-3 h-3" /> Jira API Connection Verified</>
                        ) : (
                          <><AlertTriangle className="w-3 h-3" /> Connection Failed. Check API Token.</>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ALICE Technologies Configuration */}
              <div className="border border-[#141414] bg-white p-8">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="font-serif italic text-2xl">ALICE Technologies</h3>
                  <div className="text-[10px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-2 py-1">
                    Generative AI
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50">
                        API Key
                      </label>
                      <a 
                        href="https://app.alicetechnologies.com/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono uppercase tracking-widest text-blue-600 hover:underline flex items-center gap-1"
                      >
                        Get Key <ExternalLink className="w-2 h-2" />
                      </a>
                    </div>
                    <input 
                      type="password" 
                      value={aliceApiKey}
                      onChange={(e) => setAliceApiKey(e.target.value)}
                      placeholder="Enter ALICE API Key"
                      className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-[#141414]/10">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Optimization Goal</label>
                      <select 
                        value={aliceOptimizationGoal} 
                        onChange={(e) => setAliceOptimizationGoal(e.target.value)} 
                        className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]"
                      >
                        <option value="duration">Minimize Duration</option>
                        <option value="cost">Minimize Cost</option>
                        <option value="balanced">Balanced (Cost & Time)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Construction Method</label>
                      <select 
                        value={aliceConstructionMethod} 
                        onChange={(e) => setAliceConstructionMethod(e.target.value)} 
                        className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]"
                      >
                        <option value="standard">Standard</option>
                        <option value="accelerated">Accelerated (Overtime)</option>
                        <option value="resource-constrained">Resource Constrained</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Max Duration (Days)</label>
                      <input 
                        type="number" 
                        value={aliceDuration} 
                        onChange={(e) => setAliceDuration(e.target.value)} 
                        className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]" 
                        placeholder="e.g. 365" 
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={isAliceSimulating ? handleCancelTask : handleTriggerAlice} 
                      disabled={(!aliceApiKey && !isAliceSimulating)} 
                      className={cn(
                        "w-full p-3 font-mono text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2",
                        isAliceSimulating 
                          ? "bg-red-50 text-red-600 border border-red-600 hover:bg-red-600 hover:text-white"
                          : "bg-[#141414] text-[#E4E3E0] hover:bg-black disabled:opacity-50"
                      )}
                    >
                      {isAliceSimulating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Cancel Simulation
                        </>
                      ) : (
                        "Run Generative Simulation"
                      )}
                    </button>
                  </div>

                  <div className="p-4 bg-[#141414]/5 border border-dashed border-[#141414]/20">
                    <p className="text-[10px] font-mono opacity-70 leading-relaxed">
                      Required for generative scheduling simulations and scenario optimization.
                    </p>
                  </div>
                  <div className="p-4 bg-[#141414]/5 border border-dashed border-[#141414]/20 mt-4">
                    <div className="flex items-center gap-2 text-[#141414] mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Required API Permissions</span>
                    </div>
                    <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                      The integration account must have the following ALICE API privileges enabled:
                    </p>
                    <ul className="list-disc list-inside text-[11px] opacity-70 leading-relaxed font-mono mt-2 space-y-1">
                      <li><strong>Scenario Generation:</strong> Required to trigger generative scheduling simulations.</li>
                      <li><strong>Project Read:</strong> Required to fetch simulation results and optimized schedules.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* SmartPM Configuration */}
              <div className="border border-[#141414] bg-white p-8">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="font-serif italic text-2xl">SmartPM</h3>
                  <div className="text-[10px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-2 py-1">
                    Analytics
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50">
                        API Key
                      </label>
                      <a 
                        href="https://app.smartpm.com/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono uppercase tracking-widest text-blue-600 hover:underline flex items-center gap-1"
                      >
                        Get Key <ExternalLink className="w-2 h-2" />
                      </a>
                    </div>
                    <input 
                      type="password" 
                      value={smartPmApiKey}
                      onChange={(e) => setSmartPmApiKey(e.target.value)}
                      placeholder="Enter SmartPM API Key"
                      className={cn(
                        "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1",
                        !smartPmApiKey && validationError ? "border-red-500 focus:ring-red-500" : "border-[#141414] focus:ring-[#141414]"
                      )}
                    />
                    {!smartPmApiKey && validationError && (
                      <p className="text-[9px] font-mono text-red-500 mt-1 uppercase tracking-widest">
                        * SmartPM API Key is required for global sync
                      </p>
                    )}
                  </div>
                  <div className="p-4 bg-[#141414]/5 border border-dashed border-[#141414]/20">
                    <p className="text-[10px] font-mono opacity-70 leading-relaxed">
                      Required for automated Schedule Quality Index (SQI) and delay analysis.
                    </p>
                  </div>
                  <div className="p-4 bg-[#141414]/5 border border-dashed border-[#141414]/20 mt-4">
                    <div className="flex items-center gap-2 text-[#141414] mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Required API Permissions</span>
                    </div>
                    <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                      The integration account must have the following SmartPM API privileges enabled:
                    </p>
                    <ul className="list-disc list-inside text-[11px] opacity-70 leading-relaxed font-mono mt-2 space-y-1">
                      <li><strong>Project Read/Write:</strong> Required to upload schedule updates.</li>
                      <li><strong>Analytics Read:</strong> Required to fetch SQI and delay analysis metrics.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* SharePoint Email Scraper Configuration */}
              <div className="border border-[#141414] bg-white p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <Share2 className="w-6 h-6 text-[#141414]" />
                    <h3 className="font-serif italic text-2xl">SharePoint Email Scraper</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-2 border-2 font-mono text-[11px] uppercase tracking-[0.2em] font-bold transition-all duration-500",
                      sharepointStatus === 'running' ? "bg-emerald-50 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)] text-emerald-700" :
                      sharepointStatus === 'error' ? "bg-red-50 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)] text-red-700" :
                      "bg-amber-50 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)] text-amber-700"
                    )}>
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        sharepointStatus === 'running' ? "bg-emerald-500 animate-pulse" :
                        sharepointStatus === 'error' ? "bg-red-500" :
                        "bg-amber-500"
                      )} />
                      {sharepointStatus === 'running' ? "Agent Active" :
                       sharepointStatus === 'error' ? "Agent Fault" :
                       "Agent Paused"}
                    </div>
                    <span className="text-[9px] font-mono uppercase tracking-widest opacity-50">
                      {sharepointStatus === 'running' ? "Real-time Scrape Enabled" :
                       sharepointStatus === 'error' ? "System Intervention Required" :
                       "Manual Resume Required"}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {sharepointStatus === 'error' && sharepointLastError && (
                    <div className="p-4 bg-red-50 border border-red-200 flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-mono font-bold text-red-700 uppercase tracking-widest">System Error Detected</p>
                        <p className="text-[11px] font-mono text-red-600 mt-1">{sharepointLastError}</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50">
                        SharePoint Site URL {!sharepointSiteUrl && <span className="text-red-500 font-bold ml-1">* Required</span>}
                      </label>
                      {isSharepointUrlValid && !sharepointUrlError && (
                        <div className="flex items-center gap-1 text-emerald-600 animate-in fade-in zoom-in duration-300">
                          <CheckCircle2 className="w-3 h-3" />
                          <span className="text-[9px] font-mono uppercase tracking-widest">Valid Format</span>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={sharepointSiteUrl}
                        onChange={(e) => {
                          setSharepointSiteUrl(e.target.value);
                          validateSharepointUrl(e.target.value);
                        }}
                        placeholder="https://yourcompany.sharepoint.com/sites/ProjectAlpha"
                        className={cn(
                          "w-full p-3 border font-mono text-xs bg-transparent focus:outline-none focus:ring-1 pr-10",
                          sharepointUrlError ? "border-red-500 focus:ring-red-500" : 
                          (isSharepointUrlValid ? "border-emerald-500 focus:ring-emerald-500" : "border-[#141414] focus:ring-[#141414]")
                        )}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {sharepointUrlError ? (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        ) : (
                          isSharepointUrlValid && <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                    </div>
                    {sharepointUrlError && (
                      <p className={cn(
                        "text-[9px] font-mono mt-1 uppercase tracking-widest",
                        sharepointUrlError.startsWith("Warning") ? "text-amber-600" : "text-red-500"
                      )}>
                        * {sharepointUrlError}
                      </p>
                    )}
                  </div>

                  <div className="p-4 bg-[#141414]/5 border border-[#141414]/10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#141414]" />
                        <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Inbound Ingestion Email</span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={toggleSharepointAgent}
                          disabled={sharepointStatus === 'running'}
                          className={cn(
                            "px-3 py-1 font-mono text-[9px] uppercase tracking-widest border transition-all",
                            sharepointStatus === 'running' ? "bg-emerald-500 text-white border-emerald-500 opacity-50 cursor-not-allowed" : "border-[#141414]/20 hover:bg-[#141414]/5"
                          )}
                        >
                          Run
                        </button>
                        <button 
                          onClick={toggleSharepointAgent}
                          disabled={sharepointStatus === 'paused'}
                          className={cn(
                            "px-3 py-1 font-mono text-[9px] uppercase tracking-widest border transition-all",
                            sharepointStatus === 'paused' ? "bg-amber-500 text-white border-amber-500 opacity-50 cursor-not-allowed" : "border-[#141414]/20 hover:bg-[#141414]/5"
                          )}
                        >
                          Pause
                        </button>
                        <button 
                          onClick={() => {
                            setSharepointStatus('error');
                            setSharepointLastError("Connection Timeout: SharePoint API rejected the scraper token.");
                          }}
                          className={cn(
                            "px-3 py-1 font-mono text-[9px] uppercase tracking-widest border transition-all",
                            sharepointStatus === 'error' ? "bg-red-500 text-white border-red-500" : "border-[#141414]/20 hover:bg-[#141414]/5"
                          )}
                        >
                          Simulate Error
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex-1 bg-white border border-[#141414] p-3 font-mono text-xs select-all">
                        {sharepointEmail}
                      </div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(sharepointEmail);
                          // Optional: Add toast notification
                        }}
                        className="p-3 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors"
                      >
                        <FileCode className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                      Configure SharePoint "Alert Me" notifications or Power Automate flows to CC this address when files are deposited. The agent will automatically scrape the email, identify the project, and trigger a sync.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-50">Scraping Rules</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 font-mono text-xs cursor-pointer">
                        <input type="checkbox" checked readOnly className="accent-[#141414]" />
                        Auto-detect Project ID from Subject
                      </label>
                      <label className="flex items-center gap-3 font-mono text-xs cursor-pointer">
                        <input type="checkbox" checked readOnly className="accent-[#141414]" />
                        Ingest .xer, .xml, and .mpp attachments
                      </label>
                      <label className="flex items-center gap-3 font-mono text-xs cursor-pointer">
                        <input type="checkbox" checked readOnly className="accent-[#141414]" />
                        Notify on successful scrape
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Workflow Settings */}
            <div className="border border-[#141414] bg-white p-8">
              <h3 className="font-serif italic text-2xl mb-6">Workflow Automation Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Sync Frequency</label>
                  <select className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent">
                    <option>Real-time (Webhook Triggered)</option>
                    <option>Every 6 Hours</option>
                    <option>Daily at 02:00 AM</option>
                    <option>Weekly (Sundays)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Data Extraction Scope</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 font-mono text-xs cursor-pointer">
                      <input type="checkbox" checked readOnly className="accent-[#141414]" />
                      Project Schedule (WBS, Activities, Logic)
                    </label>
                    <label className="flex items-center gap-3 font-mono text-xs cursor-pointer">
                      <input type="checkbox" checked readOnly className="accent-[#141414]" />
                      Cost Data (Budget, Actuals, Forecasts)
                    </label>
                    <label className="flex items-center gap-3 font-mono text-xs cursor-pointer">
                      <input type="checkbox" checked readOnly className="accent-[#141414]" />
                      Resource Assignments
                    </label>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Acumen Fuse Ingestion Mode</label>
                  <div className="flex gap-4">
                    <button className="flex-1 p-3 border border-[#141414] bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase tracking-widest">Append to Project</button>
                    <button className="flex-1 p-3 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414]/5">Overwrite Snapshot</button>
                  </div>
                </div>
                <div className="p-4 bg-[#141414]/5 border border-[#141414]/10">
                  <div className="flex items-center gap-2 text-amber-700 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Automation Note</span>
                  </div>
                  <p className="text-[11px] opacity-70 leading-relaxed">
                    Periodic syncs are managed via server-side cron jobs. Ensure your Primavera P6 API credentials have "Project Read" and "Cost Read" permissions enabled.
                  </p>
                </div>
              </div>
            </div>

            {/* Webhook Instructions */}
            <div className="border border-[#141414] bg-white p-8">
              <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                <h3 className="font-serif italic text-2xl">Oracle Primavera Cloud API Permissions</h3>
              </div>
              <p className="font-mono text-xs opacity-70 mb-8 max-w-2xl leading-relaxed">
                To ensure seamless data flow between Oracle Primavera Cloud and the Acumen Governance Dashboard, the integration service account must be provisioned with the following granular API permissions.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="p-6 bg-[#141414]/5 border border-[#141414]/10 space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest font-bold text-emerald-700">Project Read</div>
                  <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                    Grants access to the project structure, including Work Breakdown Structure (WBS), Activities, and Relationship Logic. This is essential for schedule quality analysis.
                  </p>
                </div>
                <div className="p-6 bg-[#141414]/5 border border-[#141414]/10 space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest font-bold text-emerald-700">Cost Read</div>
                  <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                    Allows the dashboard to retrieve financial data such as Budgeted Costs, Actual Costs, and Forecasted values for Earned Value Management (EVM) reporting.
                  </p>
                </div>
                <div className="p-6 bg-[#141414]/5 border border-[#141414]/10 space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest font-bold text-emerald-700">Resource Read</div>
                  <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                    Enables the extraction of Resource Assignments and usage data, allowing for resource-constrained analysis and generative scheduling scenarios.
                  </p>
                </div>
              </div>
            </div>

            {/* Webhook Instructions */}
            <div className="border border-[#141414] bg-[#141414] text-[#E4E3E0] p-8">
              <h3 className="font-serif italic text-2xl mb-4 text-white">Real-Time Webhook Integration</h3>
              <p className="font-mono text-xs opacity-80 mb-6 leading-relaxed max-w-3xl">
                To enable immediate data updates, configure your external systems to send HTTP POST requests to the endpoints below. The dashboard will update in real-time as data arrives.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">P6 Desktop Trigger URL</div>
                  <div className="bg-black/50 p-3 font-mono text-xs border border-white/20 select-all overflow-x-auto whitespace-nowrap">
                    {window.location.origin}/api/webhook/p6-trigger
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">Primavera P6 Webhook URL</div>
                  <div className="bg-black/50 p-3 font-mono text-xs border border-white/20 select-all overflow-x-auto whitespace-nowrap">
                    {window.location.origin}/api/webhooks/primavera
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">Acumen Fuse Webhook URL</div>
                  <div className="bg-black/50 p-3 font-mono text-xs border border-white/20 select-all overflow-x-auto whitespace-nowrap">
                    {window.location.origin}/api/webhooks/acumen
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">ALICE Webhook URL</div>
                  <div className="bg-black/50 p-3 font-mono text-xs border border-white/20 select-all overflow-x-auto whitespace-nowrap">
                    {window.location.origin}/api/webhooks/alice
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">SmartPM Webhook URL</div>
                  <div className="bg-black/50 p-3 font-mono text-xs border border-white/20 select-all overflow-x-auto whitespace-nowrap">
                    {window.location.origin}/api/webhooks/smartpm
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Governance Rules Section */}
            <div className="border border-[#141414] bg-white p-8">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6" />
                  <h3 className="font-serif italic text-2xl">Custom Governance Rules</h3>
                </div>
                {userRole === 'admin' && (
                  <button 
                    onClick={() => {
                      const metric = prompt("Enter metric (e.g., SPI, CPI, SQI):");
                      const operator = prompt("Enter operator (<, >, <=, >=, ==):") as any;
                      const threshold = parseFloat(prompt("Enter threshold value:") || "0");
                      const action = prompt("Enter action (e.g., Flag for Review, Send Alert):");
                      const severityPrompt = prompt("Enter severity (low, medium, high):")?.toLowerCase();
                      const severity = (['low', 'medium', 'high'].includes(severityPrompt || '') ? severityPrompt : 'high') as any;
                      
                      if (metric && operator && action) {
                        addGovernanceRule({ metric, operator, threshold, action, severity });
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase tracking-widest hover:bg-black transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    New Rule
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {governanceRules.length === 0 ? (
                  <div className="p-12 border border-dashed border-[#141414]/20 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-40">No active governance rules defined.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {governanceRules.map((rule) => (
                      <div key={rule.id} className={cn(
                        "p-6 border transition-all flex items-center justify-between",
                        rule.enabled ? "border-[#141414] bg-white" : "border-[#141414]/10 bg-[#141414]/5 opacity-60"
                      )}>
                        <div className="flex items-center gap-6">
                          <div className={cn(
                            "w-10 h-10 border flex items-center justify-center",
                            rule.enabled ? "border-[#141414]" : "border-[#141414]/20"
                          )}>
                            <Shield className={cn("w-5 h-5", rule.enabled ? "text-[#141414]" : "text-[#141414]/40")} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-bold uppercase tracking-widest">{rule.metric}</span>
                              <span className="font-mono text-[10px] opacity-40">{rule.operator} {rule.threshold}</span>
                              <span className={cn(
                                "px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest border",
                                rule.severity === 'high' ? "bg-red-50 text-red-700 border-red-200" :
                                rule.severity === 'medium' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                "bg-blue-50 text-blue-700 border-blue-200"
                              )}>
                                {rule.severity || 'high'}
                              </span>
                            </div>
                            <p className="text-[11px] font-serif italic opacity-60">Action: {rule.action}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          {userRole === 'admin' && (
                            <>
                              <button 
                                onClick={() => toggleRule(rule.id, rule.enabled)}
                                className={cn(
                                  "px-3 py-1 font-mono text-[9px] uppercase tracking-widest border transition-all",
                                  rule.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                                )}
                              >
                                {rule.enabled ? "Enabled" : "Disabled"}
                              </button>
                              <button 
                                onClick={() => deleteRule(rule.id)}
                                className="p-2 text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 p-4 bg-[#141414]/5 border border-[#141414]/10">
                <div className="flex items-center gap-2 text-[#141414] mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Governance Engine Note</span>
                </div>
                <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                  Rules are evaluated in real-time against incoming webhook data. Breaches trigger automated insights and risk flags in the Command Center.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

        {/* Data Sources Section */}
        {activeTab === 'sources' && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-[#141414] pb-4">
              <h3 className="font-serif italic text-2xl">Connected Data Sources</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* P6 Source Card */}
              <div className={cn(
                "border border-[#141414] p-8 relative transition-colors duration-300",
                p6Type === 'eppm' ? "bg-white border-l-4 border-l-indigo-500" : "bg-white border-l-4 border-l-emerald-500"
              )}>
                <div className="absolute top-8 right-8 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className={cn(
                      "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", 
                      isCheckingP6Health ? "bg-amber-400" :
                      p6HealthStatus === 'healthy' ? "bg-emerald-400" : "bg-red-400"
                    )}></span>
                    <span className={cn(
                      "relative inline-flex rounded-full h-3 w-3", 
                      isCheckingP6Health ? "bg-amber-500" :
                      p6HealthStatus === 'healthy' ? "bg-emerald-500" : "bg-red-500"
                    )}></span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    {isCheckingP6Health ? "Checking..." :
                     p6HealthStatus === 'healthy' ? "Connected" : "Disconnected"}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 mb-6">
                  <h4 className="font-serif italic text-xl">Primavera P6 (Azure Hosted)</h4>
                  <span className={cn(
                    "px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest border",
                    p6Type === 'eppm' ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  )}>
                    {p6Type === 'eppm' ? 'EPPM' : 'Professional'}
                  </span>
                </div>
                
                <div className="space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Environment</span>
                    <span className="col-span-2 font-bold">{p6Type === 'eppm' ? 'P6 EPPM' : 'P6 Professional (23.12+)'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Deployment</span>
                    <span className="col-span-2">{p6Type === 'eppm' ? 'Web Services (SOAP/REST)' : 'Cloud Connect (SQLite/Oracle)'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Endpoint</span>
                    <span className="col-span-2">{p6Url || "Not configured"}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Auth Type</span>
                    <span className="col-span-2">Basic Auth (Web Services)</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Last Sync</span>
                    <span className="col-span-2">2026-03-16 09:42:12</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Data Scope</span>
                    <span className="col-span-2">Schedule, Cost, Resources</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2 items-center">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">
                      {p6Type === 'eppm' ? 'Web Services Health' : 'Pro Cloud Connect Health'}
                    </span>
                    <span className="col-span-2 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {isCheckingP6Health ? (
                          <>
                            <RefreshCw className="w-3 h-3 text-amber-600 animate-spin" />
                            <span className="text-amber-700">Checking...</span>
                          </>
                        ) : p6HealthStatus === 'healthy' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Healthy</span>
                          </>
                        ) : p6HealthStatus === 'error' ? (
                          <>
                            <AlertTriangle className="w-3 h-3 text-red-600" />
                            <span className="text-red-700">Connection Failed</span>
                          </>
                        ) : (
                          <span className="opacity-50">Unknown</span>
                        )}
                      </span>
                      <button 
                        onClick={handleCheckP6Health}
                        disabled={isCheckingP6Health || !p6Url || !p6Username || !p6Password}
                        className="px-3 py-1.5 bg-[#141414] text-[#E4E3E0] text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 hover:bg-black transition-colors"
                      >
                        {isCheckingP6Health ? (
                          <><RefreshCw className="w-3 h-3 animate-spin" /> Verifying...</>
                        ) : (
                          <><Database className="w-3 h-3" /> Test Connection</>
                        )}
                      </button>
                    </span>
                  </div>
                  {p6LastHealthCheck && (
                    <div className="grid grid-cols-3 pb-2">
                      <span className="opacity-50 uppercase tracking-widest text-[10px]">Last Checked</span>
                      <span className="col-span-2">{p6LastHealthCheck}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Acumen Source Card */}
              <div className="border border-[#141414] bg-white p-8 relative">
                <div className="absolute top-8 right-8 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", (acumenDeploymentType === 'local' ? acumenLocalUrl : acumenApiKey) ? "bg-emerald-400" : "bg-red-400")}></span>
                    <span className={cn("relative inline-flex rounded-full h-3 w-3", (acumenDeploymentType === 'local' ? acumenLocalUrl : acumenApiKey) ? "bg-emerald-500" : "bg-red-500")}></span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    {(acumenDeploymentType === 'local' ? acumenLocalUrl : acumenApiKey) ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <h4 className="font-serif italic text-xl mb-6">Acumen Fuse</h4>
                
                <div className="space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Type</span>
                    <span className="col-span-2">{acumenDeploymentType === 'local' ? 'Local Desktop Agent' : 'Cloud API'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Endpoint</span>
                    <span className="col-span-2 truncate" title={acumenDeploymentType === 'local' ? acumenLocalUrl : 'api.deltek.com/acumen/v2'}>
                      {acumenDeploymentType === 'local' ? (acumenLocalUrl || 'Not configured') : 'api.deltek.com/acumen/v2'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Auth Type</span>
                    <span className="col-span-2">{acumenDeploymentType === 'local' ? 'Local Gateway Token' : 'Bearer Token (API Key)'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Last Sync</span>
                    <span className="col-span-2">2026-03-16 09:43:05</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Ingestion</span>
                    <span className="col-span-2">Append to Project</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Ingestion Health</span>
                    <span className="col-span-2 flex items-center gap-2">
                      {(acumenDeploymentType === 'local' ? acumenLocalUrl : acumenApiKey) ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Ready to receive data</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span className="text-amber-700">Awaiting Configuration</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* ALICE Technologies Source Card */}
              <div className="border border-[#141414] bg-white p-8 relative">
                <div className="absolute top-8 right-8 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", aliceApiKey ? "bg-emerald-400" : "bg-red-400")}></span>
                    <span className={cn("relative inline-flex rounded-full h-3 w-3", aliceApiKey ? "bg-emerald-500" : "bg-red-500")}></span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    {aliceApiKey ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <h4 className="font-serif italic text-xl mb-6">ALICE Technologies</h4>
                
                <div className="space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Endpoint</span>
                    <span className="col-span-2">api.alicetechnologies.com/v1</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Auth Type</span>
                    <span className="col-span-2">Bearer Token (API Key)</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Data Scope</span>
                    <span className="col-span-2">Generative Scheduling Scenarios</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Ingestion Health</span>
                    <span className="col-span-2 flex items-center gap-2">
                      {aliceApiKey ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Ready for simulations</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span className="text-amber-700">Awaiting Configuration</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* SmartPM Source Card */}
              <div className="border border-[#141414] bg-white p-8 relative">
                <div className="absolute top-8 right-8 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", smartPmApiKey ? "bg-emerald-400" : "bg-red-400")}></span>
                    <span className={cn("relative inline-flex rounded-full h-3 w-3", smartPmApiKey ? "bg-emerald-500" : "bg-red-500")}></span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    {smartPmApiKey ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <h4 className="font-serif italic text-xl mb-6">SmartPM</h4>
                
                <div className="space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Endpoint</span>
                    <span className="col-span-2">api.smartpm.com/v2</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Auth Type</span>
                    <span className="col-span-2">Bearer Token (API Key)</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Data Scope</span>
                    <span className="col-span-2">Schedule Quality Index (SQI)</span>
                  </div>
                  {smartPmApiKey && (
                    <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                      <span className="opacity-50 uppercase tracking-widest text-[10px]">Current SQI</span>
                      <span className="col-span-2 font-bold text-emerald-600">
                        {lastSync ? `${lastSync.metrics.scheduleQuality}%` : "88%"}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Ingestion Health</span>
                    <span className="col-span-2 flex items-center gap-2">
                      {smartPmApiKey ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Ready for analytics</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span className="text-amber-700">Awaiting Configuration</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* SharePoint Email Scraper Source Card */}
              <div className="border border-[#141414] bg-white p-8 relative">
                <div className="absolute top-8 right-8 flex flex-col items-end gap-1">
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 border font-mono text-[10px] uppercase tracking-widest font-bold",
                    sharepointStatus === 'running' ? "bg-emerald-50 border-emerald-500 text-emerald-700" :
                    sharepointStatus === 'error' ? "bg-red-50 border-red-500 text-red-700" :
                    "bg-amber-50 border-amber-500 text-amber-700"
                  )}>
                    <span className="relative flex h-2 w-2">
                      <span className={cn(
                        "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", 
                        sharepointStatus === 'running' ? "bg-emerald-400" : 
                        sharepointStatus === 'error' ? "bg-red-400" : "bg-amber-400"
                      )}></span>
                      <span className={cn(
                        "relative inline-flex rounded-full h-2 w-2", 
                        sharepointStatus === 'running' ? "bg-emerald-500" : 
                        sharepointStatus === 'error' ? "bg-red-500" : "bg-amber-500"
                      )}></span>
                    </span>
                    {sharepointStatus === 'running' ? "Active" : 
                     sharepointStatus === 'error' ? "Fault" : "Paused"}
                  </div>
                </div>
                <h4 className="font-serif italic text-xl mb-6">SharePoint Email Scraper</h4>
                
                <div className="space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Ingestion Email</span>
                    <span className="col-span-2 truncate">{sharepointEmail}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Site Scope</span>
                    <span className="col-span-2 truncate">{sharepointSiteUrl || "Global / All Sites"}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Auth Type</span>
                    <span className="col-span-2">Email Routing / Scraper Agent</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Last Scrape</span>
                    <span className="col-span-2">2026-03-16 11:15:22</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Ingestion Health</span>
                    <span className="col-span-2 flex items-center gap-2">
                      {sharepointStatus === 'running' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Monitoring Inbox</span>
                        </>
                      ) : sharepointStatus === 'error' ? (
                        <>
                          <AlertCircle className="w-3 h-3 text-red-600" />
                          <span className="text-red-700">Agent Fault</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span className="text-amber-700">Agent Offline</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Jira Software Source Card */}
              <div className="border border-[#141414] bg-white p-8 relative">
                <div className="absolute top-8 right-8 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", jiraHealthStatus === 'healthy' ? "bg-emerald-400" : "bg-red-400")}></span>
                    <span className={cn("relative inline-flex rounded-full h-3 w-3", jiraHealthStatus === 'healthy' ? "bg-emerald-500" : "bg-red-500")}></span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest">
                    {jiraHealthStatus === 'healthy' ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <h4 className="font-serif italic text-xl mb-6">Jira Software</h4>
                
                <div className="space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Instance</span>
                    <span className="col-span-2 truncate">{jiraUrl || "Not configured"}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Project Key</span>
                    <span className="col-span-2">{jiraProjectKey || "N/A"}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Auth Type</span>
                    <span className="col-span-2">API Token (Atlassian)</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-[#141414]/10 pb-2">
                    <span className="opacity-50 uppercase tracking-widest text-[10px]">Traceability</span>
                    <span className="col-span-2 flex items-center gap-2">
                      {jiraHealthStatus === 'healthy' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Bidirectional Enabled</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span className="text-amber-700">Awaiting Configuration</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Workflow Logs Section */}
        {activeTab === 'logs' && (
          <section className="border border-[#141414] bg-white animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 border-b border-[#141414] flex justify-between items-center bg-[#141414]/5">
              <h3 className="font-serif italic text-2xl">Workflow Logs</h3>
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleSummarizeLogs}
                  disabled={isSummarizing}
                  className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-[#141414] hover:text-white bg-white px-4 py-2 border border-[#141414] transition-all"
                >
                  {isSummarizing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                  AI Summarize
                </button>
                <button 
                  onClick={handleExportCSV}
                  className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 hover:underline bg-white px-4 py-2 border border-[#141414]"
                >
                  Export CSV <FileText className="w-3 h-3" />
                </button>
              </div>
            </div>

            {aiLogSummary && (
              <div className="p-6 bg-indigo-50 border-b border-[#141414] animate-in fade-in duration-500">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="w-4 h-4 text-indigo-600" />
                  <h4 className="font-mono text-[10px] uppercase tracking-widest font-bold text-indigo-900">AI Log Summary</h4>
                  <button onClick={() => setAiLogSummary(null)} className="ml-auto text-[10px] font-mono uppercase tracking-widest opacity-50 hover:opacity-100">Dismiss</button>
                </div>
                <p className="text-xs font-serif italic leading-relaxed text-indigo-900 whitespace-pre-wrap">
                  {aiLogSummary}
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase tracking-widest">
                    <th className="p-4">Timestamp</th>
                    <th className="p-4">Source</th>
                    <th className="p-4">Project</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Result</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {logs.map(log => (
                    <TableRow 
                      key={log.id}
                      id={log.id}
                      time={log.time} 
                      source={log.source} 
                      projectName={log.projectName || "N/A"}
                      action={log.action} 
                      status={log.status} 
                      result={log.result} 
                      isPending={log.isPending}
                      jiraIssueKey={log.jiraIssueKey}
                      onLinkJira={setIsLinkingJira}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Project Analytics Section */}
        {activeTab === 'analytics' && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-[#141414] pb-4">
              <h3 className="font-serif italic text-2xl">Project Performance Analytics</h3>
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleAnalyzeRisk}
                  disabled={isAnalyzingRisk}
                  className="px-4 py-1 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-white transition-all flex items-center gap-2"
                >
                  {isAnalyzingRisk ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                  AI Risk Analysis
                </button>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest bg-emerald-50 text-emerald-600 px-3 py-1 border border-emerald-200">
                  <Activity className="w-3 h-3" />
                  SmartPM Sync Active
                </div>
                <button 
                  onClick={() => triggerSync()}
                  className="px-4 py-1 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-white transition-all"
                >
                  Refresh Data
                </button>
              </div>
            </div>

            {aiRiskAnalysis && (
              <div className="p-8 bg-amber-50 border border-[#141414] animate-in fade-in duration-500">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <h4 className="font-serif italic text-xl text-amber-900">AI Predictive Risk Analysis</h4>
                  <button onClick={() => setAiRiskAnalysis(null)} className="ml-auto text-[10px] font-mono uppercase tracking-widest opacity-50 hover:opacity-100">Dismiss</button>
                </div>
                <div className="prose prose-sm max-w-none text-amber-900 font-serif italic leading-relaxed whitespace-pre-wrap">
                  {aiRiskAnalysis}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* SPI/CPI Trend */}
              <div className="border border-[#141414] bg-white p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h4 className="font-serif italic text-xl">Efficiency Indices</h4>
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">SPI & CPI Performance Trend</p>
                  </div>
                  <div className="flex gap-4 font-mono text-[9px] uppercase tracking-widest">
                    <span className="flex items-center gap-2"><div className="w-2 h-2 bg-indigo-500" /> SPI</span>
                    <span className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500" /> CPI</span>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analyticsMetrics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#141414', opacity: 0.5 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#141414', opacity: 0.5 }}
                        domain={[0.8, 1.2]}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141414', border: 'none', borderRadius: '0', color: '#E4E3E0', fontFamily: 'monospace', fontSize: '10px' }}
                        itemStyle={{ color: '#E4E3E0' }}
                      />
                      <Legend 
                        verticalAlign="top" 
                        align="right" 
                        iconType="circle"
                        wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: '20px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="spi" 
                        stroke="#6366f1" 
                        strokeWidth={2} 
                        dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        name="SPI"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cpi" 
                        stroke="#10b981" 
                        strokeWidth={2} 
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        name="CPI"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Schedule Variance */}
              <div className="border border-[#141414] bg-white p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h4 className="font-serif italic text-xl">Schedule Variance</h4>
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">Monthly Budget Variance ($)</p>
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-widest opacity-50">
                    Source: SmartPM / P6
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsMetrics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#141414', opacity: 0.5 }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#141414', opacity: 0.5 }}
                        tickFormatter={(value) => `$${value / 1000}k`}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f5f5f5' }}
                        contentStyle={{ backgroundColor: '#141414', border: 'none', borderRadius: '0', color: '#E4E3E0', fontFamily: 'monospace', fontSize: '10px' }}
                        itemStyle={{ color: '#E4E3E0' }}
                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Variance']}
                      />
                      <ReferenceLine y={0} stroke="#141414" strokeWidth={1} />
                      <Bar 
                        dataKey="variance" 
                        radius={[2, 2, 0, 0]}
                        name="Variance"
                      >
                        {analyticsMetrics.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.variance >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* SmartPM Integration Details */}
            <div className="border border-[#141414] bg-[#141414] text-[#E4E3E0] p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 border border-white/20 flex items-center justify-center">
                  <Database className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-serif italic text-2xl">SmartPM Advanced Analytics</h4>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">Deep Schedule Health & Critical Path Analysis</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="p-6 bg-white/5 border border-white/10 space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest font-bold text-emerald-400">Compression Index</div>
                  <div className="text-3xl font-serif italic">{smartPmMetrics.compression}%</div>
                  <p className="text-[11px] opacity-60 leading-relaxed font-mono">
                    High compression detected in Phase 3. ALICE has suggested 4 recovery scenarios.
                  </p>
                </div>
                <div className="p-6 bg-white/5 border border-white/10 space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest font-bold text-emerald-400">Critical Path Volatility</div>
                  <div className="text-3xl font-serif italic">{smartPmMetrics.volatility}</div>
                  <p className="text-[11px] opacity-60 leading-relaxed font-mono">
                    32% of activities on the critical path have shifted in the last 30 days.
                  </p>
                </div>
                <div className="p-6 bg-white/5 border border-white/10 space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest font-bold text-emerald-400">Project Health Score</div>
                  <div className="text-3xl font-serif italic">{smartPmMetrics.healthScore}/100</div>
                  <p className="text-[11px] opacity-60 leading-relaxed font-mono">
                    Based on SmartPM's proprietary schedule integrity algorithms.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Schedule Engine Section */}
        {activeTab === 'schedule' && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-[#141414] pb-4">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6" />
                <h3 className="font-serif italic text-2xl">Schedule Dependency Engine</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 border border-[#141414] p-1 bg-white/50">
                  <button 
                    onClick={() => setScheduleViewMode('gantt')}
                    className={cn(
                      "px-3 py-1 font-mono text-[9px] uppercase tracking-widest transition-all flex items-center gap-2",
                      scheduleViewMode === 'gantt' ? "bg-[#141414] text-white" : "hover:bg-[#141414]/5"
                    )}
                  >
                    <BarChart3 className="w-3 h-3" />
                    Gantt
                  </button>
                  <button 
                    onClick={() => setScheduleViewMode('network')}
                    className={cn(
                      "px-3 py-1 font-mono text-[9px] uppercase tracking-widest transition-all flex items-center gap-2",
                      scheduleViewMode === 'network' ? "bg-[#141414] text-white" : "hover:bg-[#141414]/5"
                    )}
                  >
                    <Network className="w-3 h-3" />
                    Network
                  </button>
                </div>
                <button 
                  onClick={addTask}
                  className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase tracking-widest hover:bg-black transition-all"
                >
                  <Plus className="w-3 h-3" />
                  Add Task
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Task List & Editor */}
              <div className="xl:col-span-1 space-y-4 max-h-[800px] overflow-y-auto pr-2">
                {tasks.map(task => (
                  <div key={task.id} className="border border-[#141414] bg-white p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] opacity-40">#{task.id}</span>
                        <input 
                          type="text" 
                          value={task.name}
                          onChange={(e) => updateTask(task.id, { name: e.target.value })}
                          className="font-serif italic text-lg bg-transparent border-b border-transparent hover:border-[#141414]/20 focus:border-[#141414] focus:outline-none"
                        />
                      </div>
                      <button 
                        onClick={() => deleteTask(task.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-mono uppercase tracking-widest opacity-50 mb-1">Start Date</label>
                        <input 
                          type="date" 
                          value={task.startDate}
                          onChange={(e) => updateTask(task.id, { startDate: e.target.value })}
                          className="w-full p-2 border border-[#141414]/10 font-mono text-[11px] focus:outline-none focus:border-[#141414]"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono uppercase tracking-widest opacity-50 mb-1">Duration (Days)</label>
                        <input 
                          type="number" 
                          value={task.duration}
                          onChange={(e) => updateTask(task.id, { duration: parseInt(e.target.value) || 0 })}
                          className="w-full p-2 border border-[#141414]/10 font-mono text-[11px] focus:outline-none focus:border-[#141414]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono uppercase tracking-widest opacity-50 mb-1">Predecessors</label>
                      <div className="flex flex-wrap gap-2">
                        {tasks.filter(t => t.id !== task.id).map(potentialDep => (
                          <button
                            key={potentialDep.id}
                            onClick={() => {
                              const newDeps = task.dependencies.includes(potentialDep.id)
                                ? task.dependencies.filter(id => id !== potentialDep.id)
                                : [...task.dependencies, potentialDep.id];
                              updateTask(task.id, { dependencies: newDeps });
                            }}
                            className={cn(
                              "px-2 py-1 border font-mono text-[9px] uppercase tracking-widest transition-all",
                              task.dependencies.includes(potentialDep.id)
                                ? "bg-[#141414] text-white border-[#141414]"
                                : "border-[#141414]/20 hover:border-[#141414]"
                            )}
                          >
                            {potentialDep.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Gantt Chart Visualization */}
              <div className="xl:col-span-2 border border-[#141414] bg-white p-8 overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="flex items-center justify-between mb-8">
                    <h4 className="font-serif italic text-xl">
                      {scheduleViewMode === 'gantt' ? 'Timeline Visualization' : 'Dependency Network'}
                    </h4>
                    <div className="flex gap-4 font-mono text-[9px] uppercase tracking-widest opacity-50">
                      <span className="flex items-center gap-2"><div className="w-2 h-2 bg-[#141414]" /> Task</span>
                      <span className="flex items-center gap-2"><div className="w-2 h-2 bg-amber-500" /> Milestone</span>
                    </div>
                  </div>

                  {scheduleViewMode === 'gantt' ? (
                    <>
                      {/* Gantt Header */}
                      <div className="grid grid-cols-[200px_1fr] border-b border-[#141414]/10 pb-2 mb-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">Activity</div>
                    <div className="relative h-6">
                      {/* Simple month markers */}
                      <div className="absolute inset-0 flex">
                        {[0, 1, 2, 3, 4, 5].map(i => (
                          <div key={i} className="flex-1 border-l border-[#141414]/5 pl-2 font-mono text-[9px] uppercase tracking-widest opacity-30">
                            Month {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Gantt Rows */}
                  <div className="relative">
                    {/* SVG Overlay for Dependencies */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ minHeight: tasks.length * 56 }}>
                      <defs>
                        <marker
                          id="arrowhead"
                          markerWidth="10"
                          markerHeight="7"
                          refX="9"
                          refY="3.5"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                        </marker>
                      </defs>
                      {tasks.map((task, taskIndex) => {
                        return task.dependencies.map(depId => {
                          const depIndex = tasks.findIndex(t => t.id === depId);
                          if (depIndex === -1) return null;
                          
                          const dep = tasks[depIndex];
                          const projectStart = parseISO(tasks[0]?.startDate || '2026-03-01');
                          
                          const depFinish = addDays(parseISO(dep.startDate), dep.duration);
                          const depOffset = differenceInDays(depFinish, projectStart);
                          const x1 = (depOffset / 120) * 100;
                          
                          const taskStart = parseISO(task.startDate);
                          const taskOffset = differenceInDays(taskStart, projectStart);
                          const x2 = (taskOffset / 120) * 100;
                          
                          // Row height is roughly 56px (32px bar + 24px gap/padding)
                          const y1 = depIndex * 56 + 28;
                          const y2 = taskIndex * 56 + 28;
                          
                          const isSelected = selectedDependency?.from === depId && selectedDependency?.to === task.id;
                          
                          return (
                            <g key={`${depId}-${task.id}`} className="pointer-events-auto cursor-pointer" onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDependency(isSelected ? null : { from: depId, to: task.id });
                            }}>
                              {/* Invisible wider path for easier clicking */}
                              <path
                                d={`M ${x1}% ${y1} L ${x1 + 1}% ${y1} L ${x1 + 1}% ${y2} L ${x2}% ${y2}`}
                                fill="none"
                                stroke="transparent"
                                strokeWidth="10"
                              />
                              <path
                                d={`M ${x1}% ${y1} L ${x1 + 1}% ${y1} L ${x1 + 1}% ${y2} L ${x2}% ${y2}`}
                                fill="none"
                                stroke={isSelected ? "#6366f1" : "#141414"}
                                strokeWidth={isSelected ? "2" : "1"}
                                strokeOpacity={isSelected ? "1" : "0.2"}
                                markerEnd="url(#arrowhead)"
                                className="transition-all duration-300"
                              />
                            </g>
                          );
                        });
                      })}
                    </svg>

                    <div className="space-y-6 relative z-0">
                      {tasks.map((task, taskIndex) => {
                        const start = parseISO(task.startDate);
                        const projectStart = parseISO(tasks[0]?.startDate || '2026-03-01');
                        const dayOffset = differenceInDays(start, projectStart);
                        const leftPercent = Math.max(0, (dayOffset / 120) * 100);
                        const widthPercent = Math.max(1, (task.duration / 120) * 100);
                        
                        const isHighlighted = selectedDependency && (selectedDependency.from === task.id || selectedDependency.to === task.id);

                        return (
                          <div 
                            key={task.id} 
                            className={cn(
                              "grid grid-cols-[200px_1fr] items-center group h-8 transition-all duration-300",
                              isHighlighted ? "opacity-100" : (selectedDependency ? "opacity-30" : "opacity-100")
                            )}
                            onMouseEnter={() => setHoveredTask(task.id)}
                            onMouseLeave={() => setHoveredTask(null)}
                          >
                            <div className="pr-4">
                              <div className={cn(
                                "font-mono text-[11px] truncate transition-colors",
                                isHighlighted ? "text-[#141414] font-bold" : "group-hover:text-[#141414]"
                              )}>
                                {task.name}
                              </div>
                              <div className="font-mono text-[9px] opacity-40 uppercase tracking-widest">
                                {format(start, 'MMM dd')} - {format(addDays(start, task.duration), 'MMM dd')}
                              </div>
                            </div>
                            <div className="relative h-8 bg-[#141414]/5 rounded-sm overflow-hidden">
                              <motion.div 
                                layoutId={`task-${task.id}`}
                                initial={false}
                                animate={{ 
                                  left: `${leftPercent}%`, 
                                  width: task.type === 'milestone' ? '4px' : `${widthPercent}%` 
                                }}
                                className={cn(
                                  "absolute top-2 bottom-2 shadow-sm transition-all duration-300",
                                  task.type === 'milestone' ? "bg-amber-500" : (isHighlighted ? "bg-indigo-500" : "bg-[#141414]")
                                )}
                              >
                                {task.duration > 5 && (
                                  <div className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-mono uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                                    {task.duration}d
                                  </div>
                                )}
                              </motion.div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <NetworkDiagram 
                  tasks={tasks} 
                  selectedDependency={selectedDependency} 
                  setSelectedDependency={setSelectedDependency} 
                />
              )}

                  <div className="mt-12 p-6 bg-[#141414]/5 border border-dashed border-[#141414]/20 rounded-sm">
                    <div className="flex items-center gap-2 text-[#141414] mb-2">
                      <ArrowRightLeft className="w-4 h-4" />
                      <span className="font-mono text-[10px] uppercase tracking-widest font-bold">Auto-Adjustment Logic</span>
                    </div>
                    <p className="text-[11px] opacity-70 leading-relaxed font-mono">
                      The engine uses a forward-pass topological sort. When a predecessor's duration or start date changes, all downstream tasks are automatically shifted to maintain logical constraints.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Predictive Risk Section */}
        {activeTab === 'predict' && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-[#141414] pb-4">
              <h3 className="font-serif italic text-2xl">Predictive Risk Engine</h3>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest bg-red-50 text-red-600 px-3 py-1 border border-red-200">
                <AlertTriangle className="w-3 h-3" />
                3 High Impact Risks Detected
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="border border-[#141414] bg-white p-6">
                  <h4 className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-4">Risk Heatmap (Schedule vs RFIs)</h4>
                  <div className="h-[300px] w-full bg-[#141414]/5 flex items-center justify-center border border-dashed border-[#141414]/20">
                    <div className="text-center space-y-2">
                      <BarChart3 className="w-8 h-8 mx-auto opacity-20" />
                      <p className="font-mono text-[10px] opacity-40 uppercase tracking-widest">Cross-Platform Correlation Map</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border border-[#141414] bg-white p-6">
                    <h4 className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-4">RFI Latency Impact</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="font-serif italic text-3xl">14.2d</span>
                        <span className="font-mono text-[10px] text-red-500">+2.4d vs Baseline</span>
                      </div>
                      <div className="w-full h-1 bg-[#141414]/10 rounded-full overflow-hidden">
                        <div className="w-[75%] h-full bg-red-500" />
                      </div>
                    </div>
                  </div>
                  <div className="border border-[#141414] bg-white p-6">
                    <h4 className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-4">Submittal Lead Time Risk</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="font-serif italic text-3xl">88%</span>
                        <span className="font-mono text-[10px] text-emerald-500">Stable</span>
                      </div>
                      <div className="w-full h-1 bg-[#141414]/10 rounded-full overflow-hidden">
                        <div className="w-[88%] h-full bg-emerald-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="border border-[#141414] bg-[#141414] text-[#E4E3E0] p-6">
                  <h4 className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-4">AI Agent Findings</h4>
                  <div className="space-y-4">
                    {agenticInsights.filter(i => i.type === 'risk').map(insight => (
                      <div key={insight.id} className="border-l-2 border-red-500 pl-4 py-1">
                        <div className="font-mono text-[10px] uppercase tracking-widest font-bold mb-1">{insight.title}</div>
                        <p className="text-[11px] opacity-70 leading-relaxed">{insight.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-[#141414] bg-white p-6">
                  <h4 className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-4">Mitigation Actions</h4>
                  <button className="w-full p-3 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-white transition-colors">
                    Generate Risk Report
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Recovery Planner Section */}
        {activeTab === 'optimize' && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-[#141414] pb-4">
              <h3 className="font-serif italic text-2xl">Recovery & Optimization Planner</h3>
              <div className="text-[10px] font-mono uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-3 py-1">
                Agentic Simulation Active
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <div className="border border-[#141414] bg-white p-6">
                  <h4 className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-4">Optimization Goals</h4>
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-4 h-4 border border-[#141414] rounded-sm flex items-center justify-center group-hover:bg-[#141414]/5">
                        <div className="w-2 h-2 bg-[#141414]" />
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-widest">Minimize Duration</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-4 h-4 border border-[#141414] rounded-sm flex items-center justify-center group-hover:bg-[#141414]/5" />
                      <span className="font-mono text-[10px] uppercase tracking-widest">Maximize Profit</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-4 h-4 border border-[#141414] rounded-sm flex items-center justify-center group-hover:bg-[#141414]/5" />
                      <span className="font-mono text-[10px] uppercase tracking-widest">Resource Leveling</span>
                    </label>
                  </div>
                </div>
                <button className="w-full bg-[#141414] text-[#E4E3E0] p-4 font-mono text-[10px] uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-3 h-3" />
                  Run New Simulation
                </button>
              </div>

              <div className="lg:col-span-3 space-y-6">
                <div className="border border-[#141414] bg-white p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="font-mono text-[10px] uppercase tracking-widest opacity-50">AI Suggested Recovery Scenarios</h4>
                    <span className="text-[10px] font-mono opacity-40">Showing 2 of 14 Scenarios</span>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-6 border border-[#141414] hover:shadow-lg transition-shadow bg-emerald-50/10">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="font-serif italic text-xl mb-1">Scenario A: Parallel MEP Rough-in</div>
                          <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">Confidence Score: 94%</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-lg font-bold text-emerald-600">-8 Days</div>
                          <div className="font-mono text-[9px] uppercase tracking-widest opacity-50">Duration Impact</div>
                        </div>
                      </div>
                      <p className="text-xs font-mono opacity-70 mb-6 leading-relaxed">
                        By overlapping MEP rough-in with structural framing on levels 3-5, the critical path is shortened. Requires 15% increase in MEP labor for 3 weeks.
                      </p>
                      <div className="flex gap-4">
                        <button className="px-4 py-2 bg-[#141414] text-white font-mono text-[10px] uppercase tracking-widest hover:bg-black transition-colors">
                          Apply to P6
                        </button>
                        <button className="px-4 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414]/5 transition-colors">
                          View Gantt
                        </button>
                      </div>
                    </div>

                    <div className="p-6 border border-[#141414] opacity-50 grayscale hover:grayscale-0 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="font-serif italic text-xl mb-1">Scenario B: Accelerated Procurement</div>
                          <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">Confidence Score: 72%</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-lg font-bold text-emerald-600">-4 Days</div>
                          <div className="font-mono text-[9px] uppercase tracking-widest opacity-50">Duration Impact</div>
                        </div>
                      </div>
                      <p className="text-xs font-mono opacity-70 mb-6 leading-relaxed">
                        Expediting glazing delivery by switching to air freight. High cost impact (+ $42k) for minimal schedule gain.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        {activeTab === 'cabinet' && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-[#141414] pb-4">
              <h3 className="font-serif italic text-2xl">Filing Cabinet (OneDrive)</h3>
              {!oneDriveConnected ? (
                <button 
                  onClick={handleConnectOneDrive}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0078d4] text-white font-mono text-[10px] uppercase tracking-widest hover:bg-[#005a9e] transition-colors"
                >
                  <Cloud className="w-3 h-3" />
                  Connect OneDrive
                </button>
              ) : (
                <div className="flex items-center gap-4">
                  <button 
                    onClick={fetchFiles}
                    className="p-2 border border-[#141414] hover:bg-[#141414]/5 transition-colors"
                    title="Refresh Files"
                  >
                    <RefreshCw className={cn("w-4 h-4", isLoadingFiles && "animate-spin")} />
                  </button>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Connected
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              {/* File Explorer */}
              <div 
                className={cn(
                  "lg:col-span-2 border border-[#141414] bg-white h-[600px] flex flex-col transition-all duration-300",
                  isDraggingLocal && "border-dashed border-4 border-emerald-500 bg-emerald-50/50"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingLocal(true);
                }}
                onDragLeave={() => setIsDraggingLocal(false)}
                onDrop={handleLocalDrop}
              >
                <div className="p-4 border-b border-[#141414] bg-[#141414]/5 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">OneDrive / XER Storage</span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[10px] opacity-50">{oneDriveFiles.length} Files Found</span>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 animate-pulse">
                      <Download className="w-3 h-3" />
                      Accepting Local Drops
                    </div>
                  </div>
                </div>
                
                <div className="flex-grow overflow-y-auto p-4">
                  {!oneDriveConnected ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                      <Cloud className="w-12 h-12 opacity-10" />
                      <p className="font-serif italic text-lg opacity-50">Connect your OneDrive to browse XER files</p>
                    </div>
                  ) : isLoadingFiles ? (
                    <div className="h-full flex items-center justify-center">
                      <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
                    </div>
                  ) : oneDriveFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                      <FileCode className="w-12 h-12 opacity-10" />
                      <p className="font-serif italic text-lg opacity-50">No .XER files found in your root directory</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {oneDriveFiles.map((file) => (
                        <motion.div
                          key={file.id}
                          layoutId={file.id}
                          drag
                          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                          dragElastic={0.1}
                          onDragEnd={(_, info) => {
                            // Simple check if dropped on the right side (ingestion area)
                            if (info.point.x > window.innerWidth * 0.6) {
                              handleIngestFile(file);
                            }
                          }}
                          whileDrag={{ scale: 1.05, zIndex: 50, cursor: 'grabbing' }}
                          className="p-4 border border-[#141414] bg-white cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group relative"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-[#141414]/5 group-hover:bg-[#141414] group-hover:text-white transition-colors">
                              <FileCode className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono text-xs font-bold truncate mb-1">{file.name}</div>
                              <div className="text-[10px] opacity-50 font-mono">
                                {(file.size / 1024).toFixed(1)} KB • {new Date(file.lastModifiedDateTime).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRightLeft className="w-3 h-3" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Ingestion Target */}
              <div className="flex flex-col space-y-6">
                <div className="border border-[#141414] bg-white p-6">
                  <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                    Client ID (Firestore)
                  </label>
                  <input
                    type="text"
                    value={manualIngestClientId}
                    onChange={(e) => setManualIngestClientId(e.target.value)}
                    placeholder="e.g. default, tdi"
                    className="w-full p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414]"
                  />
                  <p className="text-[9px] font-mono opacity-40 mt-2 uppercase tracking-widest">
                    Maps to clients / clientId / projects / … in Firestore (manual ingest PRD).
                  </p>
                </div>

                <div className="border border-[#141414] bg-white p-6">
                  <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">
                    Project Name
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={projectNameInput}
                      onChange={(e) => {
                        setProjectNameInput(e.target.value);
                        setIsProjectNameConfirmed(false);
                      }}
                      disabled={isProjectNameConfirmed}
                      placeholder="e.g. Project Alpha - Phase 1"
                      className={cn(
                        "flex-grow p-3 border border-[#141414] font-mono text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[#141414] transition-all",
                        isProjectNameConfirmed && "bg-emerald-50 border-emerald-500 text-emerald-700"
                      )}
                    />
                    <button
                      onClick={() => setIsProjectNameConfirmed(!isProjectNameConfirmed)}
                      disabled={!projectNameInput}
                      className={cn(
                        "px-4 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all",
                        isProjectNameConfirmed 
                          ? "bg-emerald-500 text-white border-emerald-500" 
                          : "hover:bg-[#141414] hover:text-white disabled:opacity-30"
                      )}
                    >
                      {isProjectNameConfirmed ? (
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-3 h-3" />
                          Locked
                        </div>
                      ) : "Confirm"}
                    </button>
                  </div>
                  <p className="text-[9px] font-mono opacity-40 mt-2 uppercase tracking-widest">
                    {isProjectNameConfirmed 
                      ? "Project name locked. Unlock to edit." 
                      : "Enter a name to associate with your ingestion session."}
                  </p>
                </div>

                <div 
                  className={cn(
                    "border border-[#141414] bg-[#141414] text-[#E4E3E0] p-8 h-[400px] flex flex-col items-center justify-center text-center relative overflow-hidden group transition-all duration-300",
                    isDraggingLocal && "bg-[#1a1a1a] border-emerald-500/50"
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingLocal(true);
                  }}
                  onDragLeave={() => setIsDraggingLocal(false)}
                  onDrop={handleLocalDrop}
                >
                  <div className={cn(
                    "absolute inset-0 border-4 border-dashed m-4 transition-colors duration-300",
                    isDraggingLocal ? "border-emerald-500/50" : "border-white/10"
                  )} />
                  
                  <AnimatePresence>
                    {isIngesting ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6 z-10 w-full px-12"
                      >
                        <RefreshCw className="w-12 h-12 animate-spin mx-auto text-emerald-500" />
                        <div className="space-y-2">
                          <h4 className="font-serif italic text-xl">Ingesting Data...</h4>
                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-emerald-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest opacity-50">
                            <span>Processing XER</span>
                            <span>{Math.round(uploadProgress)}%</span>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6 z-10"
                      >
                        <div 
                          className="w-20 h-20 border border-white/20 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-500 cursor-pointer"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Download className="w-8 h-8" />
                        </div>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          multiple 
                          accept=".xer,.csv,application/octet-stream,text/csv"
                          onChange={handleFileSelect}
                        />
                        <div>
                          <h4 className="font-serif italic text-2xl mb-2">Ingestion Zone</h4>
                          <p className="font-mono text-[10px] uppercase tracking-widest opacity-50 leading-relaxed">
                            Drag <strong className="text-white/80">.xer</strong> or <strong className="text-white/80">.csv</strong> here, or{' '}
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="underline hover:text-white transition-colors">click to browse</button>
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="p-6 border border-[#141414] bg-white space-y-4">
                  <h5 className="font-mono text-[10px] uppercase tracking-widest font-bold border-b border-[#141414]/10 pb-2">Ingestion Protocol</h5>
                  <ul className="space-y-3">
                    <ProtocolItem label="Schema Validation" active />
                    <ProtocolItem label="WBS Mapping" active />
                    <ProtocolItem label="Cost Normalization" active />
                    <ProtocolItem label="Governance Check" active />
                  </ul>
                </div>

                <div className="p-6 border border-[#141414] bg-white space-y-3">
                  <div className="flex items-center justify-between border-b border-[#141414]/10 pb-2">
                    <h5 className="font-mono text-[10px] uppercase tracking-widest font-bold">Recent uploads (API)</h5>
                    <button
                      type="button"
                      onClick={refreshIngestHistory}
                      disabled={ingestHistoryLoading || !projectNameInput.trim()}
                      className="px-3 py-1 border border-[#141414] font-mono text-[9px] uppercase tracking-widest hover:bg-[#141414] hover:text-white disabled:opacity-30 transition-colors"
                    >
                      {ingestHistoryLoading ? "Loading…" : "Refresh"}
                    </button>
                  </div>
                  {!projectNameInput.trim() ? (
                    <p className="text-[10px] font-mono opacity-40">Enter a project name to load upload history for that slug.</p>
                  ) : ingestUploadHistory.length === 0 ? (
                    <p className="text-[10px] font-mono opacity-40">No records yet — upload a file or refresh after ingest.</p>
                  ) : (
                    <ul className="space-y-2 max-h-48 overflow-y-auto">
                      {ingestUploadHistory.map((u) => (
                        <li key={u.id} className="text-[10px] font-mono border border-[#141414]/15 p-2">
                          <div className="font-bold truncate">{u.originalName || u.id}</div>
                          <div className="opacity-60 mt-1">
                            {u.status} · {u.sizeBytes != null ? `${(u.sizeBytes / 1024).toFixed(1)} KB` : "—"}
                            {u.activityCount != null ? ` · ${u.activityCount} activities` : ""}
                          </div>
                          <div className="opacity-40 truncate mt-0.5" title={u.sha256}>
                            {u.uploadedAt || "—"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Jira Linking Modal Overlay */}
      {isLinkingJira && (
        <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-[#141414] w-full max-w-md p-8 shadow-2xl"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-serif italic text-2xl">Link to Jira Issue</h3>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">Traceability & Cross-Tool Reporting</p>
              </div>
              <button onClick={() => setIsLinkingJira(null)} className="opacity-50 hover:opacity-100 transition-opacity">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest opacity-50 mb-2">Issue Key / Epic ID</label>
                <div className="relative">
                  <Kanban className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
                  <input 
                    type="text" 
                    placeholder="e.g. PROJ-123"
                    className="w-full pl-10 pr-4 py-3 border border-[#141414] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#141414]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        linkLogToJira(isLinkingJira, (e.target as HTMLInputElement).value);
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200">
                <p className="text-[11px] text-blue-700 leading-relaxed font-mono">
                  Linking this log will create a bidirectional reference between the Governance Automator and your Jira instance.
                </p>
              </div>

              <button 
                onClick={() => {
                  const input = document.querySelector('input[placeholder="e.g. PROJ-123"]') as HTMLInputElement;
                  if (input && input.value) linkLogToJira(isLinkingJira, input.value);
                }}
                className="w-full p-4 bg-[#141414] text-white font-mono text-xs uppercase tracking-[0.2em] font-bold hover:bg-black transition-all"
              >
                Confirm Link
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-xs font-mono uppercase tracking-widest transition-colors",
        active ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, trend, icon }: { label: string, value: string, trend: string, icon: React.ReactNode }) {
  return (
    <div className="bg-[#E4E3E0] p-6 flex flex-col justify-between h-32">
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-mono uppercase tracking-widest opacity-50">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-3xl font-serif italic font-bold">{value}</span>
        <span className={cn(
          "text-[9px] font-mono px-1.5 py-0.5 border border-[#141414]",
          trend.startsWith('+') ? "bg-green-100" : trend.startsWith('-') ? "bg-red-100" : "bg-blue-100"
        )}>{trend}</span>
      </div>
    </div>
  );
}

function WorkflowStep({ label, status, detail, active }: { label: string, status: string, detail: string, active?: boolean }) {
  return (
    <div className="flex gap-4 group">
      <div className={cn(
        "w-6 h-6 rounded-full border border-[#141414] flex items-center justify-center bg-[#E4E3E0] z-10 transition-colors",
        active && "bg-[#141414] text-[#E4E3E0]"
      )}>
        {active ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-1 h-1 bg-[#141414]" />}
      </div>
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="font-serif italic font-bold">{label}</span>
          <span className="text-[9px] font-mono uppercase tracking-widest px-1 border border-[#141414] opacity-50">
            {status}
          </span>
        </div>
        <p className="text-[11px] opacity-60 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function TableRow({ id, time, source, projectName, action, status, result, isPending, jiraIssueKey, onLinkJira }: { id: string, time: string, source: string, projectName: string, action: string, status: string, result: string, isPending?: boolean, jiraIssueKey?: string, onLinkJira: (id: string) => void, key?: any }) {
  return (
    <tr className="border-b border-[#141414]/10 hover:bg-[#141414]/5 transition-colors">
      <td className="p-4 opacity-50">{time}</td>
      <td className="p-4 font-bold">{source}</td>
      <td className="p-4 font-mono text-[10px] uppercase tracking-widest">{projectName}</td>
      <td className="p-4">{action}</td>
      <td className="p-4">
        <span className={cn(
          "px-2 py-0.5 border border-[#141414]",
          status === 'Success' ? "bg-green-50" : 
          status === 'Cancelled' ? "bg-orange-50 text-orange-700 border-orange-200" :
          isPending ? "bg-blue-50 animate-pulse" : "bg-red-50"
        )}>
          {status}
        </span>
      </td>
      <td className="p-4 opacity-70">
        <div className="flex items-center justify-between gap-4">
          <span>{result}</span>
          {jiraIssueKey ? (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-mono uppercase tracking-widest">
              <Kanban className="w-2 h-2" /> {jiraIssueKey}
            </div>
          ) : (
            <button 
              onClick={() => onLinkJira(id)}
              className="text-[9px] font-mono uppercase tracking-widest opacity-30 hover:opacity-100 hover:text-blue-600 transition-all flex items-center gap-1"
            >
              <Plus className="w-2 h-2" /> Link Jira
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ProtocolItem({ label, active }: { label: string, active?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">{label}</span>
      <div className={cn("w-2 h-2 rounded-full", active ? "bg-emerald-500" : "bg-[#141414]/20")} />
    </li>
  );
}

function NetworkDiagram({ 
  tasks, 
  selectedDependency, 
  setSelectedDependency 
}: { 
  tasks: ScheduleTask[], 
  selectedDependency: { from: string, to: string } | null,
  setSelectedDependency: (dep: { from: string, to: string } | null) => void
}) {
  const depths = React.useMemo(() => {
    const d: Record<string, number> = {};
    const getDepth = (id: string): number => {
      if (d[id] !== undefined) return d[id];
      const task = tasks.find(t => t.id === id);
      if (!task || task.dependencies.length === 0) {
        d[id] = 0;
        return 0;
      }
      const depth = Math.max(...task.dependencies.map(depId => getDepth(depId))) + 1;
      d[id] = depth;
      return depth;
    };
    tasks.forEach(t => getDepth(t.id));
    return d;
  }, [tasks]);

  const columns: Record<number, string[]> = {};
  Object.entries(depths).forEach(([id, depth]) => {
    const d = depth as number;
    if (!columns[d]) columns[d] = [];
    columns[d].push(id);
  });

  const nodePositions: Record<string, { x: number, y: number }> = {};
  const colWidth = 250;
  const rowHeight = 100;

  Object.entries(columns).forEach(([depthStr, ids]) => {
    const depth = parseInt(depthStr);
    ids.forEach((id, index) => {
      nodePositions[id] = {
        x: depth * colWidth + 100,
        y: index * rowHeight + 100
      };
    });
  });

  const maxDepth = Math.max(0, ...(Object.values(depths) as number[]));
  const maxRows = Math.max(0, ...Object.values(columns).map(ids => ids.length));

  return (
    <div className="w-full overflow-auto bg-[#f8f8f8] border border-[#141414]/10 p-8 min-h-[600px]">
      <svg 
        width={(maxDepth + 1) * colWidth + 200} 
        height={maxRows * rowHeight + 200}
        className="mx-auto"
      >
        <defs>
          <marker
            id="network-arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
        </defs>

        {/* Edges */}
        {tasks.map(task => 
          task.dependencies.map(depId => {
            const start = nodePositions[depId];
            const end = nodePositions[task.id];
            if (!start || !end) return null;

            const isSelected = selectedDependency?.from === depId && selectedDependency?.to === task.id;

            return (
              <g 
                key={`${depId}-${task.id}`} 
                className="cursor-pointer"
                onClick={() => setSelectedDependency(isSelected ? null : { from: depId, to: task.id })}
              >
                <path
                  d={`M ${start.x + 80} ${start.y} L ${end.x - 80} ${end.y}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                />
                <path
                  d={`M ${start.x + 80} ${start.y} L ${end.x - 80} ${end.y}`}
                  fill="none"
                  stroke={isSelected ? "#6366f1" : "#141414"}
                  strokeWidth={isSelected ? "3" : "1.5"}
                  strokeOpacity={isSelected ? "1" : "0.2"}
                  markerEnd="url(#network-arrowhead)"
                  className="transition-all duration-300"
                />
              </g>
            );
          })
        )}

        {/* Nodes */}
        {tasks.map(task => {
          const pos = nodePositions[task.id];
          if (!pos) return null;

          const isHighlighted = selectedDependency && (selectedDependency.from === task.id || selectedDependency.to === task.id);

          return (
            <g key={task.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect
                x="-80"
                y="-30"
                width="160"
                height="60"
                fill="white"
                stroke={isHighlighted ? "#6366f1" : "#141414"}
                strokeWidth={isHighlighted ? "3" : "1"}
                className="transition-all duration-300"
              />
              <text
                textAnchor="middle"
                dy="-5"
                className="font-mono text-[10px] uppercase tracking-widest font-bold fill-[#141414]"
              >
                {task.name.length > 20 ? task.name.substring(0, 17) + '...' : task.name}
              </text>
              <text
                textAnchor="middle"
                dy="15"
                className="font-mono text-[8px] uppercase tracking-widest opacity-50 fill-[#141414]"
              >
                {task.startDate} ({task.duration}d)
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

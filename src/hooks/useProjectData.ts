/**
 * useProjectData.ts
 * Drop-in Firestore hooks that replace the MOCK_* constants in App.tsx.
 *
 * HOW TO USE:
 * 1. Copy this file to src/hooks/useProjectData.ts
 * 2. In App.tsx, add at the top:
 *      import { useProjectData } from './hooks/useProjectData';
 * 3. Inside your App() component, replace the MOCK_* usages:
 *
 *    BEFORE:
 *      const [analyticsMetrics, setAnalyticsMetrics] = useState(MOCK_METRICS_HISTORY);
 *      // ... charts and cards read from analyticsMetrics, MOCK_HISTORY, MOCK_TASKS
 *
 *    AFTER:
 *      const { tasks, qualityTrend, summary, loading } = useProjectData(activeClientId, activeProjectId);
 *      // pass these directly to your charts and cards
 *
 * Firestore path: /clients/{clientId}/projects/{projectId}
 */

import { useState, useEffect } from "react";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Types (match what xerParser writes) ──────────────────────────────────────

export interface ProjectSummary {
  totalActivities: number;
  completedActivities: number;
  inProgressActivities: number;
  notStartedActivities: number;
  criticalActivities: number;
  percentComplete: number;
  spi: number;
  cpi: number;
  budgetAtCompletion: number;
  earnedValue: number;
  actualCost: number;
  plannedValue: number;
  scheduleVariance: number;
  costVariance: number;
  budgetVariance: number;
  projectedFinish: string;
  daysRemaining: number;
  lowFloatCount: number;
  negativeLagCount: number;
  missingLogicCount: number;
  qualityScore: number;
}

export interface ScheduleTask {
  id: string;
  name: string;
  startDate: string;
  duration: number;
  dependencies: string[];
  type: "task" | "milestone";
  percentComplete: number;
  isCritical: boolean;
  totalFloat: number;
  status: "not_started" | "in_progress" | "completed";
}

export interface QualityPoint {
  date: string;
  quality: number;
  risk: number;
}

export interface ProjectMeta {
  projectName: string;
  dataDate: string;
  startDate: string;
  finishDate: string;
  ingestedAt: string;
  sourceFile: string;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useProjectData(clientId: string, projectId: string) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [qualityTrend, setQualityTrend] = useState<QualityPoint[]>([]);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !projectId) return;

    setLoading(true);
    setError(null);

    const projectRef = doc(db, "clients", clientId, "projects", projectId);

    // ── Real-time listener on project document (summary + quality trend) ──
    const unsubProject = onSnapshot(
      projectRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSummary(data.summary as ProjectSummary ?? null);
          setQualityTrend(data.qualityTrend ?? []);
          setMeta({
            projectName: data.projectName ?? "",
            dataDate: data.dataDate ?? "",
            startDate: data.startDate ?? "",
            finishDate: data.finishDate ?? "",
            ingestedAt: data.ingestedAt ?? "",
            sourceFile: data.sourceFile ?? "",
          });
        } else {
          setSummary(null);
          setMeta(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Firestore project listener error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // ── Real-time listener on activities sub-collection ──
    const activitiesRef = collection(
      db,
      "clients", clientId,
      "projects", projectId,
      "activities"
    );
    const activitiesQuery = query(activitiesRef, orderBy("startDate"), limit(5000));

    const unsubActivities = onSnapshot(
      activitiesQuery,
      (snap) => {
        const acts: ScheduleTask[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            startDate: data.startDate ?? "",
            duration: data.duration ?? 0,
            dependencies: data.dependencies ?? [],
            type: data.type ?? "task",
            percentComplete: data.percentComplete ?? 0,
            isCritical: data.isCritical ?? false,
            totalFloat: data.totalFloat ?? 0,
            status: data.status ?? "not_started",
          };
        });
        setTasks(acts);
      },
      (err) => {
        console.error("Firestore activities listener error:", err);
      }
    );

    return () => {
      unsubProject();
      unsubActivities();
    };
  }, [clientId, projectId]);

  return { summary, meta, qualityTrend, tasks, loading, error };
}

// ── Client list hook ──────────────────────────────────────────────────────────
// Use this to populate a client/project switcher dropdown in your UI

export function useClientList() {
  const [clients, setClients] = useState<{ id: string; projects: string[] }[]>([]);

  useEffect(() => {
    // In a private single-user app, you can just hardcode your client IDs here
    // OR read from a top-level /clients collection if you set one up
    // For now, set the default client programmatically when you upload
  }, []);

  return { clients };
}

/**
 * HOW TO WIRE THIS INTO YOUR DASHBOARD KPI CARDS
 * ─────────────────────────────────────────────────
 * In App.tsx, inside App():
 *
 *   const [activeClientId, setActiveClientId] = useState("my-client-name");
 *   const [activeProjectId, setActiveProjectId] = useState("project-alpha");
 *   const { summary, meta, qualityTrend, tasks, loading } = useProjectData(activeClientId, activeProjectId);
 *
 * Then replace hardcoded values:
 *
 *   BEFORE: <div>91%</div>  ← Schedule Quality
 *   AFTER:  <div>{summary?.qualityScore ?? "—"}%</div>
 *
 *   BEFORE: <div>0.98</div>  ← CPI
 *   AFTER:  <div>{summary?.cpi?.toFixed(2) ?? "—"}</div>
 *
 *   BEFORE: <div>1.02</div>  ← SPI
 *   AFTER:  <div>{summary?.spi?.toFixed(2) ?? "—"}</div>
 *
 *   BEFORE: <div>$12.4k</div>  ← Budget Variance
 *   AFTER:  <div>${((summary?.budgetVariance ?? 0) / 1000).toFixed(1)}k</div>
 *
 *   BEFORE: data={MOCK_HISTORY}  ← Quality vs Risk chart
 *   AFTER:  data={qualityTrend}
 *
 *   BEFORE: analyzeScheduleRisk(MOCK_TASKS, analyticsMetrics)
 *   AFTER:  analyzeScheduleRisk(tasks, summary)
 *
 * Add a loading state:
 *   {loading ? <Spinner /> : <YourDashboard />}
 */

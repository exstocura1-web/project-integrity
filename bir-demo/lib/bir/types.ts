/**
 * BIR™ demo — normalized schedule model and analysis output types.
 */

export type ScenarioTag = "baseline" | "current" | "other";

export interface ScheduleTask {
  id: string;
  name?: string;
  duration?: number;
  totalFloat?: number;
  freeFloat?: number;
  constraintType?: string;
  isMilestone?: boolean;
}

export interface ScheduleRelationship {
  predId: string;
  succId: string;
  type?: string;
}

export interface ScheduleModel {
  source: "xer" | "csv" | "unknown";
  fileName: string;
  byteLength: number;
  activityCount: number;
  relationshipCount: number;
  tasks: ScheduleTask[];
  relationships: ScheduleRelationship[];
  /** Heuristic flags from parse pass */
  parseNotes: string[];
}

export type CategoryStatus = "pass" | "warn" | "fail";

export interface CategoryScore {
  id: string;
  label: string;
  score: number;
  status: CategoryStatus;
  detail: string;
}

export interface KeyFinding {
  id: string;
  title: string;
  severity: CategoryStatus;
  description: string;
  commercialImpact: string;
}

export interface BirFindings {
  overallScore: number;
  scenario: ScenarioTag;
  categoryScores: CategoryScore[];
  keyFindings: KeyFinding[];
  recommendations: string[];
  chartIssueByCategory: { label: string; value: number }[];
  chartFloatBands: { label: string; value: number }[];
  generatedAt: string;
}

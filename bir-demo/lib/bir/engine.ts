import type {
  BirFindings,
  CategoryScore,
  KeyFinding,
  ScenarioTag,
  ScheduleModel,
} from "./types";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function statusFromScore(score: number): "pass" | "warn" | "fail" {
  if (score >= 72) return "pass";
  if (score >= 48) return "warn";
  return "fail";
}

/**
 * Demo-grade BIR™ scoring — deterministic from model metrics (replace with full BIR™ rules later).
 */
export function runBirAnalysis(
  model: ScheduleModel,
  scenario: ScenarioTag,
): BirFindings {
  const ac = model.activityCount || model.tasks.length || 1;
  const rc = model.relationshipCount || Math.floor(ac * 1.2);
  const tasksWithFloat = model.tasks.filter((t) => typeof t.totalFloat === "number");
  const highFloat =
    tasksWithFloat.length > 0
      ? tasksWithFloat.filter((t) => (t.totalFloat ?? 0) > 45).length / tasksWithFloat.length
      : Math.min(0.45, ac / 12_000);

  const logicDensity = rc / Math.max(ac, 1);
  const missingLogicProxy = clamp(1 - logicDensity / 1.8, 0, 1); // higher = worse
  const constraintProxy = clamp((model.byteLength % 97) / 97, 0.08, 0.55);
  const logicScore = clamp(100 - missingLogicProxy * 55 - (model.source === "unknown" ? 12 : 0), 0, 100);
  const floatScore = clamp(100 - highFloat * 60, 0, 100);
  const constraintScore = clamp(100 - constraintProxy * 70, 0, 100);
  const milestoneScore = clamp(92 - (ac > 8_000 ? 8 : 0), 35, 100);

  const weights = { logic: 0.35, float: 0.25, constraint: 0.25, milestone: 0.15 };
  const overallScore = Math.round(
    logicScore * weights.logic +
      floatScore * weights.float +
      constraintScore * weights.constraint +
      milestoneScore * weights.milestone,
  );

  const categoryScores: CategoryScore[] = [
    {
      id: "logic",
      label: "Logic density & predecessors",
      score: Math.round(logicScore),
      status: statusFromScore(logicScore),
      detail:
        logicDensity < 1.1
          ? `Relationship-to-activity ratio (~${logicDensity.toFixed(2)}) suggests missing or loose logic — bid schedules often mask risk here.`
          : `Relationship density (~${logicDensity.toFixed(2)}) looks workable for a first pass; still verify driving paths.`,
    },
    {
      id: "float",
      label: "Float bands & pacing",
      score: Math.round(floatScore),
      status: statusFromScore(floatScore),
      detail:
        tasksWithFloat.length > 0
          ? `${Math.round(highFloat * 100)}% of sampled activities show high total float in the extract.`
          : `Float profile inferred from file heuristics (full float calc in production BIR™).`,
    },
    {
      id: "constraints",
      label: "Constraints & date pins",
      score: Math.round(constraintScore),
      status: statusFromScore(constraintScore),
      detail: `Constraint posture proxy score — hard constraints on bid schedules frequently compress negotiability.`,
    },
    {
      id: "milestones",
      label: "Milestones & phase gates",
      score: Math.round(milestoneScore),
      status: statusFromScore(milestoneScore),
      detail: `Phase gating sanity check against activity population (~${ac.toLocaleString()} activities).`,
    },
  ];

  const keyFindings: KeyFinding[] = [
    {
      id: "f1",
      title: "Pre-award logic exposure",
      severity: statusFromScore(logicScore),
      description:
        missingLogicProxy > 0.35
          ? "Network appears under-connected versus activity count; request bidder narrative on driving path and late changes."
          : "Logic density is middling; spot-check near critical Path of winning scenario.",
      commercialImpact:
        "Weak logic transfers float risk and CO exposure post-contract — price that in your evaluation narrative.",
    },
    {
      id: "f2",
      title: "Float / pacing profile",
      severity: statusFromScore(floatScore),
      description:
        highFloat > 0.25
          ? "Elevated high-float population can indicate buffer stacking or calendar mismatches."
          : "Float profile does not flash red on this extract; still reconcile against production calendars.",
      commercialImpact:
        "Misread float at bid stage becomes TIA gap and disputed productivity later — worth a second pass before award.",
    },
    {
      id: "f3",
      title: "Constraint & resequencing risk",
      severity: statusFromScore(constraintScore),
      description:
        "Bid schedules often lean on constraints; this demo flags posture for owner review (full rulebook in BIR™ production).",
      commercialImpact: "Hard pins can invalidate assumed float — affects LD exposure and interim dates.",
    },
  ];

  if (model.source === "unknown") {
    keyFindings.push({
      id: "f4",
      title: "File format",
      severity: "warn",
      description:
        "Upload was not .xer or .csv; analysis used file-size heuristics only — export from P6 for a sharper BIR™ pass.",
      commercialImpact: "Owner IMS reviews should run on native XER to align with audit trail.",
    });
  }

  const recommendations = [
    "Demand a narrative tie-out for the critical path and any negative-float activities before award.",
    "Reconcile calendar defaults (5x7 vs 7x7) against stated work windows — common bid gap.",
    "If this is baseline vs update, run paired BIR™ after aligning data date and scope cut.",
  ];

  const chartIssueByCategory = categoryScores.map((c) => ({
    label: c.label.replace(/ & .*$/, ""),
    value: 100 - c.score,
  }));

  const chartFloatBands = [
    { label: "0–10d", value: Math.round(clamp(40 - highFloat * 80, 10, 45)) },
    { label: "11–45d", value: Math.round(clamp(25 + highFloat * 40, 15, 50)) },
    { label: ">45d", value: Math.round(clamp(15 + highFloat * 50, 8, 40)) },
    { label: "n/a (extract)", value: tasksWithFloat.length ? 0 : 20 },
  ];

  return {
    overallScore: clamp(overallScore, 0, 100),
    scenario,
    categoryScores,
    keyFindings,
    recommendations,
    chartIssueByCategory,
    chartFloatBands,
    generatedAt: new Date().toISOString(),
  };
}

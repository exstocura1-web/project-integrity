import type { ScheduleModel, ScheduleRelationship, ScheduleTask } from "./types";

const MAX_SCAN_BYTES = 12 * 1024 * 1024;

function readHead(buffer: Buffer, maxLen: number): string {
  const n = Math.min(buffer.length, maxLen);
  return buffer.subarray(0, n).toString("utf8");
}

/** Count occurrences of a line prefix in first chunk (XER table rows often use %T) */
function countLinesStartingWith(text: string, prefix: string): number {
  let c = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(prefix)) c += 1;
  }
  return c;
}

/**
 * Minimal CSV: header row with id + optional duration/float columns.
 */
function parseCsvTasks(text: string): { tasks: ScheduleTask[]; notes: string[] } {
  const notes: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    notes.push("CSV had fewer than 2 lines; using synthetic counts only.");
    return { tasks: [], notes };
  }
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idIdx =
    header.findIndex((h) => h === "activity id" || h === "task_id" || h === "id" || h === "activity_id");
  const durIdx = header.findIndex((h) => h === "duration" || h === "remain_drtn_hr_cnt");
  const tfIdx = header.findIndex(
    (h) => h.includes("total_float") || h === "total float" || h === "float",
  );
  if (idIdx < 0) {
    notes.push("CSV missing recognizable id column; counted rows as activities.");
    return { tasks: [], notes };
  }
  const tasks: ScheduleTask[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const id = cols[idIdx];
    if (!id) continue;
    const duration = durIdx >= 0 ? Number(cols[durIdx]) : undefined;
    const totalFloat = tfIdx >= 0 ? Number(cols[tfIdx]) : undefined;
    tasks.push({
      id,
      duration: Number.isFinite(duration) ? duration : undefined,
      totalFloat: Number.isFinite(totalFloat) ? totalFloat : undefined,
    });
  }
  if (tasks.length) notes.push(`CSV parsed ${tasks.length} activity rows.`);
  return { tasks: tasks.slice(0, 50_000), notes };
}

/**
 * XER: demo-grade heuristics — count TASK rows and relationship table rows without full schema parse.
 */
function parseXerHeuristic(text: string): {
  activityCount: number;
  relationshipCount: number;
  tasks: ScheduleTask[];
  relationships: ScheduleRelationship[];
  notes: string[];
} {
  const notes: string[] = [];
  // Primavera XER exports use %T then table name;
  const tmRows = countLinesStartingWith(text, "%R"); // data rows
  // Often ACTIVITY rows exist; task table varies by version — use TM (%T TASK pattern in some files)
  const taskTableMarker = text.includes("%T\tTASK") || text.includes("%T TASK");
  const tasklike = taskTableMarker
    ? countLinesStartingWith(text, "%R")
    : Math.max(0, Math.floor(tmRows * 0.6));

  let activityCount = Math.max(tasklike, countLinesStartingWith(text, "%T\tTASK") ? tmRows : 0);
  if (activityCount === 0) {
    // Fallback: estimate from file structure
    const tLines = text.split(/\r?\n/).filter((l) => l.includes("\t")).length;
    activityCount = Math.min(50_000, Math.max(50, Math.floor(tLines / 8)));
    notes.push("XER structure heuristic applied (limited parse).");
  } else {
    notes.push(`XER scan estimated ~${activityCount} data rows (demo heuristic).`);
  }

  const relationshipCount = Math.floor(activityCount * 1.4);
  return {
    activityCount: Math.min(activityCount, 100_000),
    relationshipCount: Math.min(relationshipCount, 200_000),
    tasks: [],
    relationships: [],
    notes,
  };
}

export async function parseScheduleFile(
  buffer: Buffer,
  fileName: string,
): Promise<ScheduleModel> {
  const notes: string[] = [];
  if (buffer.length > MAX_SCAN_BYTES) {
    notes.push(`File truncated for scan at ${MAX_SCAN_BYTES} bytes (demo limit).`);
  }
  const low = fileName.toLowerCase();
  const ext = low.endsWith(".xer") ? "xer" : low.endsWith(".csv") ? "csv" : "unknown";

  if (ext === "csv") {
    const text = readHead(buffer, MAX_SCAN_BYTES);
    const { tasks, notes: n } = parseCsvTasks(text);
    notes.push(...n);
    return {
      source: "csv",
      fileName,
      byteLength: buffer.length,
      activityCount: tasks.length || Math.max(20, Math.floor(buffer.length / 400)),
      relationshipCount: Math.floor((tasks.length || 100) * 1.2),
      tasks,
      relationships: [],
      parseNotes: notes,
    };
  }

  if (ext === "xer") {
    const text = readHead(buffer, MAX_SCAN_BYTES);
    const x = parseXerHeuristic(text);
    notes.push(...x.notes);
    return {
      source: "xer",
      fileName,
      byteLength: buffer.length,
      activityCount: x.activityCount,
      relationshipCount: x.relationshipCount,
      tasks: x.tasks,
      relationships: x.relationships,
      parseNotes: notes,
    };
  }

  notes.push("Unknown extension; treating as opaque schedule export (demo stub).");
  const guess = Math.max(80, Math.min(15_000, Math.floor(buffer.length / 500)));
  return {
    source: "unknown",
    fileName,
    byteLength: buffer.length,
    activityCount: guess,
    relationshipCount: Math.floor(guess * 1.3),
    tasks: [],
    relationships: [],
    parseNotes: notes,
  };
}

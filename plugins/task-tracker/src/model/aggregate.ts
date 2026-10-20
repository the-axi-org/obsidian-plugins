// Pure totals over log entries. All results are in minutes.

import { dateKey, type LogEntry } from "./log";

export type Range = "today" | "week" | "all";

/** Key used for entries whose task id isn't in the index. */
export const UNKNOWN_TASK = "Unknown task";

/** What aggregation needs to know about a task. `project` is "" for tasks directly in the root. */
export interface TaskMeta {
  project: string;
  tags: readonly string[];
}

export const entryMinutes = (e: LogEntry) => e.endMin - e.startMin;

/** Local midnight of the Monday `weeks` weeks after the week containing `now`. */
function monday(now: Date, weeks = 0): Date {
  const offset = (now.getDay() + 6) % 7; // Monday = 0
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset + weeks * 7);
}

/** YYYY-MM-DD of the Monday starting the week that contains `now`. */
export function weekStart(now: Date): string {
  return dateKey(monday(now));
}

export function inRange(date: string, range: Range, now: Date): boolean {
  if (range === "all") return true;
  if (range === "today") return date === dateKey(now);
  return date >= weekStart(now) && date < dateKey(monday(now, 1));
}

export function filterRange(entries: Iterable<LogEntry>, range: Range, now: Date): LogEntry[] {
  return [...entries].filter((e) => inRange(e.date, range, now));
}

export function total(entries: Iterable<LogEntry>): number {
  let sum = 0;
  for (const e of entries) sum += entryMinutes(e);
  return sum;
}

function add(map: Map<string, number>, key: string, minutes: number) {
  map.set(key, (map.get(key) ?? 0) + minutes);
}

/** Totals keyed by task id. Unknown ids keep their own id; see `UNKNOWN_TASK` for grouped views. */
export function totalsByTask(entries: Iterable<LogEntry>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) add(out, e.taskId, entryMinutes(e));
  return out;
}

/** "Work/Backend/API" → ["Work", "Work/Backend", "Work/Backend/API"]. */
export function projectAncestors(project: string): string[] {
  if (!project) return [""];
  const parts = project.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * Totals keyed by project path. With `nested`, time also counts toward every parent project,
 * so "Work" includes "Work/Backend". Unknown tasks are counted under `UNKNOWN_TASK`.
 */
export function totalsByProject(
  entries: Iterable<LogEntry>,
  tasks: ReadonlyMap<string, TaskMeta>,
  { nested }: { nested: boolean },
): Map<string, number> {
  return totalsByKeys(entries, tasks, (t) => (nested ? projectAncestors(t.project) : [t.project]));
}

/** Totals keyed by tag. A task with several tags counts toward each. Unknown tasks → `UNKNOWN_TASK`. */
export function totalsByTag(
  entries: Iterable<LogEntry>,
  tasks: ReadonlyMap<string, TaskMeta>,
): Map<string, number> {
  return totalsByKeys(entries, tasks, (t) => new Set(t.tags));
}

/** Adds each entry to every key `keysOf` returns for its task, or to `UNKNOWN_TASK`. */
function totalsByKeys(
  entries: Iterable<LogEntry>,
  tasks: ReadonlyMap<string, TaskMeta>,
  keysOf: (task: TaskMeta) => Iterable<string>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const task = tasks.get(e.taskId);
    for (const key of task ? keysOf(task) : [UNKNOWN_TASK]) add(out, key, entryMinutes(e));
  }
  return out;
}

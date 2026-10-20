// Task notes: any markdown file under tasksRoot (outside logFolder) whose frontmatter has an `id`.
// Kept free of `obsidian` imports so it can be unit tested; callers pass in paths and frontmatter.

import { parseDuration } from "./duration";
import { isTaskId } from "./ids";

export type Status = "todo" | "doing" | "done";
export const STATUSES: readonly Status[] = ["todo", "doing", "done"];

export interface TaskInfo {
  id: string;
  path: string;
  title: string;
  /** Parent folder relative to tasksRoot; "" when the task sits directly in tasksRoot. */
  project: string;
  /** Normalized for display: unknown values read as "todo". */
  status: Status;
  /** The `status` value as written in the note. */
  rawStatus: unknown;
  tags: string[];
  /** Estimate as written, and its parsed minutes (null when unparseable). */
  estimate?: string;
  estimateMin?: number | null;
  created: string;
  completed?: string;
}

export type Frontmatter = Record<string, unknown>;

/** Strips leading/trailing slashes; "" and "/" mean the vault root. */
export function normalizeFolder(folder: string): string {
  return folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function isInFolder(path: string, folder: string): boolean {
  const f = normalizeFolder(folder);
  return f === "" || path === f || path.startsWith(`${f}/`);
}

/** Whether `path` is a markdown file the task index should consider. */
export function isTaskCandidate(path: string, tasksRoot: string, logFolder: string): boolean {
  return (
    path.endsWith(".md") &&
    isInFolder(path, tasksRoot) &&
    !(normalizeFolder(logFolder) !== "" && isInFolder(path, logFolder))
  );
}

export function projectOf(path: string, tasksRoot: string): string {
  const root = normalizeFolder(tasksRoot);
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (root === "") return parent;
  return parent === root ? "" : parent.slice(root.length + 1);
}

export function titleOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.md$/, "");
}

export function normalizeStatus(value: unknown): Status {
  return STATUSES.includes(value as Status) ? (value as Status) : "todo";
}

export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [];
  const tags = raw
    .filter((t): t is string | number => typeof t === "string" || typeof t === "number")
    .map((t) => String(t).trim().replace(/^#/, ""))
    .filter((t) => t !== "");
  return [...new Set(tags)];
}

/** Dates may come back from YAML as strings or Date objects. */
function readDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return undefined;
}

/** The task described by a note, or null if the note isn't a task. */
export function readTask(path: string, fm: Frontmatter | null | undefined, tasksRoot: string): TaskInfo | null {
  if (!fm || !isTaskId(fm.id)) return null;
  const estimate =
    typeof fm.estimate === "string" || typeof fm.estimate === "number" ? String(fm.estimate).trim() : "";
  const task: TaskInfo = {
    id: fm.id,
    path,
    title: titleOf(path),
    project: projectOf(path, tasksRoot),
    status: normalizeStatus(fm.status),
    rawStatus: fm.status,
    tags: normalizeTags(fm.tags),
    created: readDate(fm.created) ?? "",
  };
  if (estimate) {
    task.estimate = estimate;
    task.estimateMin = parseDuration(estimate);
  }
  const completed = readDate(fm.completed);
  if (completed) task.completed = completed;
  return task;
}

/** Mutates frontmatter for a status change, keeping `completed` in step. */
export function applyStatus(fm: Frontmatter, status: Status, today: string): void {
  fm.status = status;
  if (status === "done") fm.completed = today;
  else if ("completed" in fm) fm.completed = null;
}

/** Fills in the required task fields that are missing. Leaves existing values alone. */
export function applyMissingTaskFields(fm: Frontmatter, id: string, created: string): void {
  if (!isTaskId(fm.id)) fm.id = id;
  if (fm.status === undefined || fm.status === null || fm.status === "") fm.status = "todo";
  if (!readDate(fm.created)) fm.created = created;
}

const PLAIN_SCALAR = /^[\p{L}\p{N}_][\p{L}\p{N}_/.-]*$/u;

function yamlScalar(value: string): string {
  return PLAIN_SCALAR.test(value) ? value : JSON.stringify(value);
}

/** Frontmatter block for a brand-new task note. */
export function newTaskContent(opts: { id: string; tags: string[]; estimate: string; created: string }): string {
  const lines = [
    "---",
    `id: ${opts.id}`,
    "status: todo",
    `tags: [${opts.tags.map(yamlScalar).join(", ")}]`,
    ...(opts.estimate ? [`estimate: ${yamlScalar(opts.estimate)}`] : []),
    `created: ${opts.created}`,
    "completed:",
    "---",
    "",
  ];
  return lines.join("\n");
}

/** Characters Obsidian won't allow in file names (plus path separators). */
const BAD_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

export function sanitizeTitle(title: string): string {
  return title.replace(BAD_NAME_CHARS, " ").replace(/\s+/g, " ").trim();
}

/** "Work / Backend/" → "Work/Backend". */
export function sanitizeProject(project: string): string {
  return project
    .split(/[\\/]/)
    .map(sanitizeTitle)
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("/");
}

/** Comma-separated tag input → tag list without "#". */
export function parseTagInput(input: string): string[] {
  return normalizeTags(
    input
      .split(",")
      .map((t) => t.trim().replace(/\s+/g, "-"))
      .filter(Boolean),
  );
}

/** `{base}.md`, then `{base} (2).md`, `{base} (3).md`, ... until `exists` returns false. */
export function availablePath(base: string, exists: (path: string) => boolean): string {
  let path = `${base}.md`;
  for (let n = 2; exists(path); n++) path = `${base} (${n}).md`;
  return path;
}

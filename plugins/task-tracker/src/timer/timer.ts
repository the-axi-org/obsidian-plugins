import { Events, TFile, type App } from "obsidian";
import { UNKNOWN_TASK } from "../model/aggregate";
import { formatClock } from "../model/duration";
import { appendLogLines, dateKey, formatLogLine, logHeading, splitByDay, toLocalIso, type DaySpan } from "../model/log";
import { applyStatus, normalizeFolder, type Status } from "../model/task";
import type { Task, TaskIndex } from "../index/taskIndex";

/** Persisted under `activeTimer` in plugin data. Elapsed time is always `now - start`. */
export interface ActiveTimer {
  taskId: string;
  /** Local ISO 8601 with offset. */
  start: string;
}

export interface TimerHost {
  app: App;
  tasks: TaskIndex;
  logFolder(): string;
  getActive(): ActiveTimer | null;
  setActive(timer: ActiveTimer | null): Promise<void>;
}

/** Creates every missing folder along `path`. */
export async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = normalizeFolder(path).split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join("/");
    if (!app.vault.getAbstractFileByPath(sub)) await app.vault.createFolder(sub);
  }
}

export function logPath(logFolder: string, date: string): string {
  const folder = normalizeFolder(logFolder);
  return folder ? `${folder}/${date}.md` : `${date}.md`;
}

/** The log note for `date`, created with its heading if missing. */
export async function ensureLogNote(app: App, logFolder: string, date: string): Promise<TFile> {
  const path = logPath(logFolder, date);
  const existing = app.vault.getFileByPath(path);
  if (existing) return existing;
  await ensureFolder(app, logFolder);
  return app.vault.create(path, `${logHeading(date)}\n\n`);
}

/**
 * The single running timer. Operations are serialized so a quick start→stop can't interleave
 * its log writes. Events: "changed" whenever the active timer starts or stops.
 */
export class Timer extends Events {
  private queue: Promise<unknown> = Promise.resolve();
  /** Titles of tasks deleted while their timer ran, for the log link. */
  private lastTitles = new Map<string, string>();

  constructor(private host: TimerHost) {
    super();
  }

  get active(): ActiveTimer | null {
    return this.host.getActive();
  }

  startTime(): Date | null {
    const active = this.active;
    return active ? new Date(active.start) : null;
  }

  elapsedMs(now = Date.now()): number {
    const start = this.startTime();
    return start ? now - start.getTime() : 0;
  }

  isRunning(taskId: string): boolean {
    return this.active?.taskId === taskId;
  }

  title(taskId: string): string {
    return this.host.tasks.get(taskId)?.title ?? this.lastTitles.get(taskId) ?? UNKNOWN_TASK;
  }

  start(task: Task): Promise<void> {
    return this.enqueue(async () => {
      if (this.active?.taskId === task.id) return;
      if (this.active) await this.stopNow(new Date());
      await this.host.setActive({ taskId: task.id, start: toLocalIso(new Date()) });
      this.trigger("changed");
      if (task.rawStatus === "todo") await this.writeStatus(task, "doing");
    });
  }

  /** Stops the running timer. When `expected` is supplied, ignores a replaced timer. */
  stop(end?: Date, expected?: ActiveTimer): Promise<void> {
    return this.enqueue(async () => {
      if (expected && !this.matchesActive(expected)) return;
      await this.stopNow(end ?? new Date());
    });
  }

  toggle(task: Task): Promise<void> {
    return this.isRunning(task.id) ? this.stop() : this.start(task);
  }

  /** Marks a task done (stopping its timer first) or reopens it as todo. */
  setDone(task: Task, done: boolean): Promise<void> {
    return this.enqueue(async () => {
      if (done && this.active?.taskId === task.id) await this.stopNow(new Date());
      await this.writeStatus(task, done ? "done" : "todo");
    });
  }

  /** Called when a task's note is deleted: its id stays valid in the logs, so log what ran. */
  onTaskDeleted(task: Task): Promise<void> {
    if (!this.isRunning(task.id)) return Promise.resolve();
    this.lastTitles.set(task.id, task.title);
    return this.stop();
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async stopNow(end: Date) {
    const active = this.active;
    if (!active) return;
    const start = new Date(active.start);
    if (end.getTime() < start.getTime()) end = start;
    await this.appendEntries(active.taskId, splitByDay(start, end));
    // Sync may have replaced the timer while the log writes were in flight.
    if (!this.matchesActive(active)) return;
    await this.host.setActive(null);
    this.trigger("changed");
  }

  private matchesActive(timer: ActiveTimer): boolean {
    return this.active?.taskId === timer.taskId && this.active.start === timer.start;
  }

  private async appendEntries(taskId: string, spans: DaySpan[]) {
    const { app } = this.host;
    const title = this.title(taskId);
    const linkText = title === UNKNOWN_TASK ? taskId : title;
    const byDate = new Map<string, string[]>();
    for (const span of spans) {
      const lines = byDate.get(span.date) ?? [];
      lines.push(formatLogLine(span, linkText, taskId));
      byDate.set(span.date, lines);
    }
    for (const [date, lines] of byDate) {
      const file = await ensureLogNote(app, this.host.logFolder(), date);
      await app.vault.process(file, (content) => appendLogLines(content, date, lines));
    }
  }

  private async writeStatus(task: Task, status: Status) {
    // The task may have been renamed since `task` was read; re-resolve by id.
    const file = this.host.tasks.get(task.id)?.file ?? task.file;
    if (!this.host.app.vault.getFileByPath(file.path)) return;
    await this.host.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) =>
      applyStatus(fm, status, dateKey(new Date())),
    );
  }
}

/** "⏱ <title> · 1:23:45" while running, "⏱ No task" when idle. */
export class TimerStatusBar {
  constructor(
    private el: HTMLElement,
    private timer: Timer,
    onClick: () => void,
  ) {
    el.addClass("task-tracker-status", "mod-clickable");
    el.addEventListener("click", onClick);
    this.update();
  }

  update(now = Date.now()): void {
    const active = this.timer.active;
    this.el.setText(
      active ? `⏱ ${this.timer.title(active.taskId)} · ${formatClock(this.timer.elapsedMs(now))}` : "⏱ No task",
    );
  }
}

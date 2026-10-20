import { App, Events, Notice, TFile, TFolder, type TAbstractFile } from "obsidian";
import { isTaskCandidate, isInFolder, normalizeFolder, readTask, type TaskInfo } from "../model/task";

export type Task = TaskInfo & { file: TFile };

export interface IndexFolders {
  tasksRoot: string;
  logFolder: string;
}

/**
 * In-memory map of task id → task, built from the metadata cache.
 *
 * Events: "changed" after any update; "deleted" (task) when a deletion leaves an id with no file.
 */
export class TaskIndex extends Events {
  private byPath = new Map<string, Task>();
  private pathsById = new Map<string, Set<string>>();
  private byId = new Map<string, Task>();
  /** Duplicate groups already reported, so each is announced once. */
  private reported = new Set<string>();

  constructor(
    private app: App,
    private folders: () => IndexFolders,
  ) {
    super();
  }

  get(id: string): Task | undefined {
    return this.byId.get(id);
  }

  all(): Task[] {
    return [...this.byId.values()];
  }

  /** The indexed task backed by `file`, if any. Duplicate copies that lost to an older file don't count. */
  forFile(file: TFile | null): Task | undefined {
    if (!file) return undefined;
    const task = this.byPath.get(file.path);
    return task && this.byId.get(task.id)?.file === file ? this.byId.get(task.id) : undefined;
  }

  /** Every id in use, including ids of duplicate copies. */
  allIds(): Set<string> {
    return new Set(this.pathsById.keys());
  }

  /** Ids claimed by more than one file → files sorted oldest first (the first one is indexed). */
  duplicates(): Map<string, TFile[]> {
    const out = new Map<string, TFile[]>();
    for (const [id, paths] of this.pathsById) {
      if (paths.size > 1) out.set(id, this.ranked(paths).map((t) => t.file));
    }
    return out;
  }

  /** Project paths: every folder under tasksRoot (except the log folder), plus projects of indexed tasks. */
  projects(): string[] {
    const { tasksRoot, logFolder } = this.folders();
    const root = normalizeFolder(tasksRoot);
    const log = normalizeFolder(logFolder);
    const out = new Set<string>();
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (!(f instanceof TFolder) || f.path === "/" || f.path === root) continue;
      if (!isInFolder(f.path, root) || (log && isInFolder(f.path, log))) continue;
      out.add(root ? f.path.slice(root.length + 1) : f.path);
    }
    for (const t of this.byId.values()) if (t.project) out.add(t.project);
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  tags(): string[] {
    const out = new Set<string>();
    for (const t of this.byId.values()) t.tags.forEach((tag) => out.add(tag));
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  /** Rebuild from scratch, e.g. on layout ready or after the folder settings change. */
  build(): void {
    const before = new Map(this.byId);
    this.byPath.clear();
    this.pathsById.clear();
    this.byId.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.read(file);
    for (const id of this.pathsById.keys()) this.resolve(id);
    for (const [id, task] of before) {
      if (!this.byId.has(id) && !this.app.vault.getFileByPath(task.file.path)) this.trigger("deleted", task);
    }
    this.trigger("changed");
  }

  /** Wire vault and metadata events. `register` is the plugin's `registerEvent`. */
  watch(register: (ref: ReturnType<Events["on"]>) => void): void {
    const { vault, metadataCache } = this.app;
    register(metadataCache.on("changed", (file) => this.update(file)));
    register(vault.on("create", (file) => file instanceof TFile && this.update(file)));
    register(
      vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          this.remove(oldPath);
          this.update(file);
        } else {
          this.build();
        }
      }),
    );
    register(vault.on("delete", (file) => this.onDelete(file)));
  }

  private onDelete(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
      this.build();
      return;
    }
    const old = this.byPath.get(file.path);
    this.remove(file.path);
    if (old && !this.byId.has(old.id)) this.trigger("deleted", old);
    this.trigger("changed");
  }

  private update(file: TFile) {
    const old = this.byPath.get(file.path);
    this.remove(file.path, false);
    const task = this.read(file);
    if (old) this.resolve(old.id);
    if (task && task.id !== old?.id) this.resolve(task.id);
    if (old || task) this.trigger("changed");
  }

  /** Index one file's entry without resolving winners. */
  private read(file: TFile): Task | null {
    const { tasksRoot, logFolder } = this.folders();
    if (!isTaskCandidate(file.path, tasksRoot, logFolder)) return null;
    const info = readTask(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter, tasksRoot);
    if (!info) return null;
    const task: Task = { ...info, file };
    this.byPath.set(file.path, task);
    let paths = this.pathsById.get(task.id);
    if (!paths) this.pathsById.set(task.id, (paths = new Set()));
    paths.add(file.path);
    return task;
  }

  private remove(path: string, resolve = true) {
    const old = this.byPath.get(path);
    if (!old) return;
    this.byPath.delete(path);
    const paths = this.pathsById.get(old.id);
    paths?.delete(path);
    if (paths?.size === 0) this.pathsById.delete(old.id);
    if (resolve) this.resolve(old.id);
  }

  private ranked(paths: Iterable<string>): Task[] {
    return [...paths]
      .map((p) => this.byPath.get(p)!)
      .sort((a, b) => a.file.stat.ctime - b.file.stat.ctime || a.path.localeCompare(b.path));
  }

  /** Pick the oldest file for an id and report new duplicates. */
  private resolve(id: string) {
    const paths = this.pathsById.get(id);
    if (!paths || paths.size === 0) {
      this.byId.delete(id);
      return;
    }
    const [winner, ...copies] = this.ranked(paths);
    this.byId.set(id, winner!);
    if (copies.length === 0) return;
    const key = [id, winner!.path, ...copies.map((c) => c.path)].join("|");
    if (this.reported.has(key)) return;
    this.reported.add(key);
    new Notice(
      `Duplicate task id ${id} in "${winner!.path}" and ${copies.map((c) => `"${c.path}"`).join(", ")}. ` +
        `Keeping the older note. Run "Fix duplicate task ids" to give the copies new ids.`,
      10000,
    );
  }
}

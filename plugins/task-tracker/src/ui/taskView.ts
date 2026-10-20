import { debounce, ItemView, setIcon, type HoverPopover, type WorkspaceLeaf } from "obsidian";
import {
  filterRange,
  projectAncestors,
  total,
  totalsByProject,
  totalsByTask,
  type Range,
  type TaskMeta,
} from "../model/aggregate";
import { formatClock, formatDuration } from "../model/duration";
import type { LogEntry } from "../model/log";
import type { Task } from "../index/taskIndex";
import type TaskTrackerPlugin from "../main";

export const VIEW_TYPE = "task-tracker-view";

export type StatusFilter = "all" | "open" | "done";

/** Persisted under `view` in plugin data. */
export interface ViewState {
  status: StatusFilter;
  tags: string[];
  search: string;
  range: Range;
  collapsed: string[];
}

export const DEFAULT_VIEW_STATE: ViewState = {
  status: "open",
  tags: [],
  search: "",
  range: "today",
  collapsed: [],
};

const RANGE_LABELS: Record<Range, string> = { today: "Today", week: "Week", all: "All" };
const STATUS_LABELS: Record<StatusFilter, string> = { all: "All", open: "Open", done: "Done" };

/** Pure filter used by the view: status, all selected tags, and a case-insensitive title search. */
export function filterTasks(tasks: Iterable<Task>, state: Pick<ViewState, "status" | "tags" | "search">): Task[] {
  const q = state.search.trim().toLowerCase();
  return [...tasks].filter(
    (t) =>
      (state.status === "all" || (state.status === "done") === (t.status === "done")) &&
      state.tags.every((tag) => t.tags.includes(tag)) &&
      (!q || t.title.toLowerCase().includes(q)),
  );
}

function tagChip(parent: HTMLElement, tag: string, label: string, onClick: () => void): HTMLElement {
  const chip = parent.createEl("button", { cls: "tt-chip", text: `#${tag}`, attr: { "aria-label": label } });
  chip.addEventListener("click", onClick);
  return chip;
}

/** Sort project paths segment by segment so parents come right before their children. */
export function compareProjects(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    const c = as[i]!.localeCompare(bs[i]!, undefined, { sensitivity: "base" });
    if (c !== 0) return c;
  }
  return as.length - bs.length;
}

export class TaskView extends ItemView {
  hoverPopover: HoverPopover | null = null;

  private headerEl!: HTMLElement;
  private elapsedEl: HTMLElement | null = null;
  private tagFilterEl!: HTMLElement;
  private listEl!: HTMLElement;
  private rangeEl!: HTMLElement;
  private statusSelect!: HTMLSelectElement;
  private searchInput!: HTMLInputElement;

  /** Re-render at most every ~200 ms when indexes change. */
  readonly scheduleRender = debounce(() => this.render(), 200, true);

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: TaskTrackerPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Tasks";
  }

  override getIcon(): string {
    return "list-checks";
  }

  private get state(): ViewState {
    return this.plugin.data.view;
  }

  /** Applies a filter/range/collapse change, saves it, and re-renders. */
  private update(patch: Partial<ViewState>) {
    Object.assign(this.state, patch);
    void this.plugin.persist();
    this.render();
  }

  override async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("task-tracker-view");
    this.headerEl = root.createDiv({ cls: "tt-header" });
    this.buildControls(root.createDiv({ cls: "tt-controls" }));
    this.listEl = root.createDiv({ cls: "tt-list" });
    this.rangeEl = root.createDiv({ cls: "tt-range" });

    const schedule = () => this.scheduleRender();
    this.registerEvent(this.plugin.tasks.on("changed", schedule));
    this.registerEvent(this.plugin.time.on("changed", schedule));
    this.registerEvent(this.plugin.timer.on("changed", schedule));
    this.registerInterval(window.setInterval(() => this.tick(), 1000));
    this.render();
  }

  override async onClose(): Promise<void> {
    this.scheduleRender.cancel();
    this.contentEl.empty();
  }

  /** Updates only the running elapsed time. */
  tick(now = Date.now()): void {
    this.elapsedEl?.setText(formatClock(this.plugin.timer.elapsedMs(now)));
  }

  render(): void {
    const now = new Date();
    const entries = this.plugin.time.entries();
    this.renderHeader(entries, now);
    this.renderTagFilter();
    this.renderList(entries, now);
    this.renderRange();
  }

  private buildControls(el: HTMLElement) {
    const top = el.createDiv({ cls: "tt-controls-row" });
    const newBtn = top.createEl("button", { cls: "mod-cta tt-new", text: "New task" });
    newBtn.addEventListener("click", () => this.plugin.openNewTaskModal());

    this.statusSelect = top.createEl("select", { cls: "dropdown tt-status", attr: { "aria-label": "Status" } });
    for (const [value, label] of Object.entries(STATUS_LABELS)) {
      this.statusSelect.createEl("option", { text: label, attr: { value } });
    }
    this.statusSelect.value = this.state.status;
    this.statusSelect.addEventListener("change", () =>
      this.update({ status: this.statusSelect.value as StatusFilter }),
    );

    this.searchInput = el.createEl("input", {
      cls: "tt-search",
      attr: { type: "search", placeholder: "Search tasks…", "aria-label": "Search tasks" },
    });
    this.searchInput.value = this.state.search;
    this.searchInput.addEventListener("input", () => this.update({ search: this.searchInput.value }));

    this.tagFilterEl = el.createDiv({ cls: "tt-tag-filter" });
  }

  private renderHeader(entries: LogEntry[], now: Date) {
    const el = this.headerEl;
    el.empty();
    const totals = el.createDiv({ cls: "tt-totals" });
    totals.createSpan({ text: `Today ${formatDuration(total(filterRange(entries, "today", now)))}` });
    totals.createSpan({ text: `Week ${formatDuration(total(filterRange(entries, "week", now)))}` });

    this.elapsedEl = null;
    const active = this.plugin.timer.active;
    if (!active) return;
    const running = el.createDiv({ cls: "tt-running" });
    const task = this.plugin.tasks.get(active.taskId);
    const title = running.createSpan({ cls: "tt-running-title", text: this.plugin.timer.title(active.taskId) });
    if (task) {
      title.addClass("tt-link");
      title.addEventListener("click", () => void this.plugin.openTask(task));
    }
    this.elapsedEl = running.createSpan({ cls: "tt-elapsed" });
    this.tick(now.getTime());
    const stop = running.createEl("button", { cls: "tt-stop", attr: { "aria-label": "Stop timer" } });
    setIcon(stop, "square");
    stop.addEventListener("click", () => void this.plugin.timer.stop());
  }

  private renderTagFilter() {
    const el = this.tagFilterEl;
    el.empty();
    const all = this.plugin.tasks.tags();
    for (const tag of this.state.tags) {
      tagChip(el, tag, `Remove #${tag} filter`, () => this.update({ tags: this.state.tags.filter((t) => t !== tag) }))
        .addClass("is-selected");
    }
    const remaining = all.filter((t) => !this.state.tags.includes(t));
    if (remaining.length === 0) return;
    const select = el.createEl("select", { cls: "dropdown tt-tag-select", attr: { "aria-label": "Filter by tag" } });
    select.createEl("option", { text: "Filter by tag…", attr: { value: "" } });
    for (const tag of remaining) select.createEl("option", { text: `#${tag}`, attr: { value: tag } });
    select.addEventListener("change", () => {
      if (select.value) this.addTagFilter(select.value);
    });
  }

  addTagFilter(tag: string): void {
    if (!this.state.tags.includes(tag)) this.update({ tags: [...this.state.tags, tag] });
  }

  private renderList(entries: LogEntry[], now: Date) {
    const el = this.listEl;
    el.empty();
    const { tasks, timer } = this.plugin;
    const visible = filterTasks(tasks.all(), this.state);
    if (visible.length === 0) {
      el.createDiv({ cls: "tt-empty", text: "No tasks match." });
      return;
    }

    const meta = new Map<string, TaskMeta>(tasks.all().map((t) => [t.id, t]));
    const projectTotals = totalsByProject(filterRange(entries, this.state.range, now), meta, { nested: true });
    const todayByTask = totalsByTask(filterRange(entries, "today", now));

    const byProject = new Map<string, Task[]>();
    for (const t of visible) {
      // Every ancestor gets a group too, so nested projects render under their parents.
      for (const p of projectAncestors(t.project)) if (!byProject.has(p)) byProject.set(p, []);
      byProject.get(t.project)!.push(t);
    }

    const collapsed = new Set(this.state.collapsed);
    for (const project of [...byProject.keys()].sort(compareProjects)) {
      if (projectAncestors(project).some((p) => p !== project && collapsed.has(p))) continue;
      const depth = project ? project.split("/").length - 1 : 0;
      const group = el.createDiv({ cls: "tt-group" });
      group.setCssProps({ "--tt-depth": String(depth) });

      const isCollapsed = collapsed.has(project);
      const header = group.createDiv({ cls: "tt-group-header", attr: { role: "button", tabindex: "0" } });
      header.toggleClass("is-collapsed", isCollapsed);
      setIcon(header.createSpan({ cls: "tt-caret" }), isCollapsed ? "chevron-right" : "chevron-down");
      header.createSpan({ cls: "tt-group-name", text: project ? project.split("/").pop()! : "No project" });
      header.createSpan({ cls: "tt-group-total", text: formatDuration(projectTotals.get(project) ?? 0) });
      const toggle = () =>
        this.update({
          collapsed: isCollapsed ? this.state.collapsed.filter((p) => p !== project) : [...this.state.collapsed, project],
        });
      header.addEventListener("click", toggle);
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
      if (isCollapsed) continue;

      const rows = group.createDiv({ cls: "tt-rows" });
      const list = (byProject.get(project) ?? []).sort((a, b) => a.title.localeCompare(b.title));
      for (const task of list) this.renderRow(rows, task, todayByTask.get(task.id) ?? 0, timer.isRunning(task.id));
    }
  }

  private renderRow(parent: HTMLElement, task: Task, todayMin: number, running: boolean) {
    const row = parent.createDiv({ cls: "tt-row" });
    row.toggleClass("is-running", running);
    row.toggleClass("is-done", task.status === "done");

    const check = row.createEl("input", { cls: "task-list-item-checkbox", attr: { type: "checkbox", "aria-label": "Done" } });
    check.checked = task.status === "done";
    check.addEventListener("change", () => void this.plugin.timer.setDone(task, check.checked));

    const title = row.createSpan({ cls: "tt-title tt-link", text: task.title });
    title.addEventListener("click", () => void this.plugin.openTask(task));
    title.addEventListener("mouseover", (event) => {
      this.app.workspace.trigger("hover-link", {
        event,
        source: VIEW_TYPE,
        hoverParent: this,
        targetEl: title,
        linktext: task.file.path,
        sourcePath: "",
      });
    });

    if (task.tags.length) {
      const tags = row.createSpan({ cls: "tt-tags" });
      for (const tag of task.tags) tagChip(tags, tag, `Filter by #${tag}`, () => this.addTagFilter(tag));
    }

    const time = task.estimate ? `${formatDuration(todayMin)} / ${task.estimate}` : formatDuration(todayMin);
    row.createSpan({ cls: "tt-time", text: time, attr: { "aria-label": "Tracked today / estimate" } });

    const btn = row.createEl("button", { cls: "tt-play", attr: { "aria-label": running ? "Stop timer" : "Start timer" } });
    setIcon(btn, running ? "square" : "play");
    btn.addEventListener("click", () => void this.plugin.timer.toggle(task));
  }

  private renderRange() {
    const el = this.rangeEl;
    el.empty();
    for (const range of Object.keys(RANGE_LABELS) as Range[]) {
      const btn = el.createEl("button", { cls: "tt-range-btn", text: RANGE_LABELS[range] });
      btn.toggleClass("is-active", this.state.range === range);
      btn.setAttr("aria-pressed", String(this.state.range === range));
      btn.addEventListener("click", () => this.update({ range }));
    }
  }
}

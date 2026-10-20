import { Notice, Plugin, TFile } from "obsidian";
import { TaskIndex, type Task } from "./index/taskIndex";
import { TimeIndex } from "./index/timeIndex";
import { formatDuration } from "./model/duration";
import { isTaskId, uniqueId } from "./model/ids";
import { dateKey } from "./model/log";
import {
  applyMissingTaskFields,
  availablePath,
  isTaskCandidate,
  newTaskContent,
  normalizeFolder,
  parseTagInput,
  sanitizeProject,
  sanitizeTitle,
} from "./model/task";
import { DEFAULT_SETTINGS, TaskTrackerSettingTab, type TaskTrackerSettings } from "./settings";
import { BreakTracker } from "./timer/breaks";
import { ensureFolder, ensureLogNote, Timer, TimerStatusBar, type ActiveTimer } from "./timer/timer";
import { NewTaskModal, type NewTaskInput } from "./ui/newTaskModal";
import { StaleTimerModal } from "./ui/staleTimerModal";
import { TaskSuggestModal } from "./ui/taskSuggest";
import { DEFAULT_VIEW_STATE, TaskView, VIEW_TYPE, type ViewState } from "./ui/taskView";

export interface PluginData {
  settings: TaskTrackerSettings;
  activeTimer: ActiveTimer | null;
  view: ViewState;
}

function readActiveTimer(value: unknown): ActiveTimer | null {
  const t = value as Partial<ActiveTimer> | null | undefined;
  if (!t || !isTaskId(t.taskId) || typeof t.start !== "string") return null;
  return Number.isNaN(new Date(t.start).getTime()) ? null : { taskId: t.taskId, start: t.start };
}

export default class TaskTrackerPlugin extends Plugin {
  data: PluginData = {
    settings: { ...DEFAULT_SETTINGS },
    activeTimer: null,
    view: { ...DEFAULT_VIEW_STATE },
  };
  /** Same object as `data.settings`. */
  override settings: TaskTrackerSettings = this.data.settings;
  tasks!: TaskIndex;
  time!: TimeIndex;
  timer!: Timer;
  private statusBar!: TimerStatusBar;
  private breaks = new BreakTracker((minutes) => {
    new Notice(`Time for a break — you've been going for ${formatDuration(minutes)}`, 10000);
  });
  private staleChecked = false;

  override async onload() {
    await this.loadPluginData();

    this.tasks = new TaskIndex(this.app, () => this.settings);
    this.time = new TimeIndex(this.app, () => this.settings.logFolder);
    this.timer = new Timer({
      app: this.app,
      tasks: this.tasks,
      logFolder: () => this.settings.logFolder,
      getActive: () => this.data.activeTimer,
      setActive: async (timer) => {
        this.data.activeTimer = timer;
        await this.persist();
      },
    });

    this.registerView(VIEW_TYPE, (leaf) => new TaskView(leaf, this));
    this.registerHoverLinkSource(VIEW_TYPE, { display: "Task tracker", defaultMod: false });
    this.addRibbonIcon("list-checks", "Open task view", () => void this.activateView());

    this.statusBar = new TimerStatusBar(this.addStatusBarItem(), this.timer, () => {
      const task = this.timer.active && this.tasks.get(this.timer.active.taskId);
      if (task) void this.openTask(task);
      else void this.activateView();
    });

    this.addCommands();
    this.addSettingTab(new TaskTrackerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      const register = (ref: Parameters<Plugin["registerEvent"]>[0]) => this.registerEvent(ref);
      this.tasks.watch(register);
      this.time.watch(register);
      this.registerEvent(this.tasks.on("deleted", (task) => void this.timer.onTaskDeleted(task as Task)));
      this.registerEvent(this.tasks.on("changed", () => this.statusBar.update()));
      this.registerEvent(this.timer.on("changed", () => this.statusBar.update()));
      this.tasks.build();
      await this.time.build();
      this.registerInterval(window.setInterval(() => this.tick(), 1000));
      this.tick();
    });
  }

  /** Runs every second: status bar, break reminders, stale-timer check. */
  tick(now = Date.now()): void {
    this.statusBar.update(now);
    const start = this.timer.startTime();
    const s = this.settings;
    this.breaks.tick(now, start?.getTime() ?? null, s.breakIntervalMinutes, s.breakRemindersEnabled);
    if (start && !this.staleChecked && now - start.getTime() > s.maxRunningHours * 3_600_000) {
      this.staleChecked = true;
      new StaleTimerModal(this.app, {
        title: this.timer.title(this.timer.active!.taskId),
        start,
        onChoose: ({ stopAt }) => {
          if (stopAt) void this.timer.stop(stopAt);
        },
      }).open();
    }
  }

  private addCommands() {
    this.addCommand({ id: "new-task", name: "New task", callback: () => this.openNewTaskModal() });

    this.addCommand({
      id: "start-timer-current",
      name: "Start timer on current note",
      checkCallback: (checking) => {
        const task = this.tasks.forFile(this.app.workspace.getActiveFile());
        if (!task) return false;
        if (!checking) void this.timer.start(task);
        return true;
      },
    });

    this.addCommand({
      id: "start-timer-pick",
      name: "Start timer…",
      callback: () => {
        const open = this.tasks.all().filter((t) => t.status !== "done");
        new TaskSuggestModal(this.app, open, (task) => void this.timer.start(task)).open();
      },
    });

    this.addCommand({
      id: "stop-timer",
      name: "Stop timer",
      checkCallback: (checking) => {
        if (!this.timer.active) return false;
        if (!checking) void this.timer.stop();
        return true;
      },
    });

    this.addCommand({
      id: "toggle-done-current",
      name: "Toggle done on current note",
      checkCallback: (checking) => {
        const task = this.tasks.forFile(this.app.workspace.getActiveFile());
        if (!task) return false;
        if (!checking) void this.timer.setDone(task, task.status !== "done");
        return true;
      },
    });

    this.addCommand({ id: "open-task-view", name: "Open task view", callback: () => void this.activateView() });

    this.addCommand({
      id: "open-today-log",
      name: "Open today's log",
      callback: async () => {
        const file = await ensureLogNote(this.app, this.settings.logFolder, dateKey(new Date()));
        await this.app.workspace.getLeaf(false).openFile(file);
      },
    });

    this.addCommand({
      id: "assign-missing-ids",
      name: "Convert current note to task",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !isTaskCandidate(file.path, this.settings.tasksRoot, this.settings.logFolder)) return false;
        if (isTaskId(this.app.metadataCache.getFileCache(file)?.frontmatter?.id)) return false;
        if (!checking) void this.convertToTask(file);
        return true;
      },
    });

    this.addCommand({
      id: "fix-duplicate-ids",
      name: "Fix duplicate task ids",
      callback: () => void this.fixDuplicateIds(),
    });
  }

  openNewTaskModal(): void {
    new NewTaskModal(this.app, {
      defaultProject: this.settings.defaultProject,
      projects: () => this.tasks.projects(),
      onSubmit: (input) => this.createTask(input).then(() => undefined),
    }).open();
  }

  /** Creates `{tasksRoot}/{project}/{title}.md` and opens it. */
  async createTask(input: NewTaskInput): Promise<TFile | null> {
    const title = sanitizeTitle(input.title);
    if (!title) {
      new Notice("A task needs a title.");
      return null;
    }
    const project = sanitizeProject(input.project.trim() || this.settings.defaultProject);
    const folder = [normalizeFolder(this.settings.tasksRoot), project].filter(Boolean).join("/");
    await ensureFolder(this.app, folder);
    const base = folder ? `${folder}/${title}` : title;
    const path = availablePath(base, (p) => this.app.vault.getAbstractFileByPath(p) !== null);
    const file = await this.app.vault.create(
      path,
      newTaskContent({
        id: uniqueId(this.tasks.allIds()),
        tags: parseTagInput(input.tags),
        estimate: input.estimate.trim(),
        created: dateKey(new Date()),
      }),
    );
    await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }

  async convertToTask(file: TFile): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) =>
      applyMissingTaskFields(fm, uniqueId(this.tasks.allIds()), dateKey(new Date(file.stat.ctime))),
    );
  }

  /** Gives every newer copy of a duplicated id a fresh id. The oldest file keeps the original. */
  async fixDuplicateIds(): Promise<void> {
    const taken = this.tasks.allIds();
    let fixed = 0;
    for (const files of this.tasks.duplicates().values()) {
      for (const file of files.slice(1)) {
        const id = uniqueId(taken);
        taken.add(id);
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          fm.id = id;
        });
        fixed++;
      }
    }
    new Notice(fixed ? `Assigned new ids to ${fixed} duplicate task note${fixed === 1 ? "" : "s"}.` : "No duplicate task ids found.");
  }

  async openTask(task: Task): Promise<void> {
    await this.app.workspace.getLeaf(false).openFile(task.file);
  }

  async activateView(): Promise<void> {
    await this.app.workspace.ensureSideLeaf(VIEW_TYPE, "right", { active: true, reveal: true });
  }

  /** Rebuilds both indexes, e.g. after the folder settings change. */
  async reindex(): Promise<void> {
    this.tasks.build();
    await this.time.build();
  }

  async loadPluginData() {
    const saved = (await this.loadData()) as Partial<PluginData> | null;
    this.data = {
      settings: { ...DEFAULT_SETTINGS, ...saved?.settings },
      activeTimer: readActiveTimer(saved?.activeTimer),
      view: { ...DEFAULT_VIEW_STATE, ...saved?.view },
    };
    this.settings = this.data.settings;
  }

  async persist() {
    await this.saveData(this.data);
  }
}

// Wiring tests against @op/obsidian-mock: commands, timer log writes, indexes and the view.
import {
  createMockApp,
  getSettings,
  loadPlugin,
  notices,
  openModals,
  type App,
  type ButtonComponent,
  type Command,
  type Modal as MockModal,
  type TextComponent,
  WorkspaceLeaf,
} from "@op/obsidian-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../manifest.json";
import TaskTrackerPlugin from "../src/main";
import { StaleTimerModal } from "../src/ui/staleTimerModal";
import { TaskView, VIEW_TYPE } from "../src/ui/taskView";

const task = (id: string, extra = "") => `---\nid: ${id}\nstatus: todo\ntags: [backend]\ncreated: 2026-09-26\n${extra}---\nBody\n`;

/** Lets the async onLayoutReady callback and queued writes finish. */
const flush = () => new Promise((r) => setTimeout(r, 0));

let plugins: TaskTrackerPlugin[] = [];

async function setup(files: Record<string, string> = {}, data: unknown = null) {
  const app = createMockApp({ files });
  const plugin = await loadPlugin(TaskTrackerPlugin, manifest, { app, data });
  plugins.push(plugin);
  await flush();
  return { app, plugin };
}

const read = (app: App, path: string) => app.vault.readNow(path);
const setNow = (d: Date) => vi.setSystemTime(d);
const command = (plugin: { commands: Command[] }, id: string) => plugin.commands.find((c) => c.id === id)!;
/** The plugin's StaleTimerModal, seen through the mock's Modal for `isOpen`. */
const staleModal = () => openModals[0] as unknown as StaleTimerModal & MockModal;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow(new Date(2026, 8, 26, 9, 0));
  notices.length = 0;
  openModals.length = 0;
});

afterEach(() => {
  plugins.forEach((p) => p.unload());
  plugins = [];
  vi.useRealTimers();
});

describe("tasks", () => {
  it("creates a task in a new project with valid frontmatter", async () => {
    const { app, plugin } = await setup();
    const file = await plugin.createTask({ title: "Fix login bug", project: "Work/Backend", tags: "backend, #urgent", estimate: "90m" });
    expect(file?.path).toBe("Tasks/Work/Backend/Fix login bug.md");
    expect(app.vault.getFolderByPath("Tasks/Work/Backend")).not.toBeNull();
    expect(read(app, file!.path)).toMatch(
      /^---\nid: t-[0-9a-f]{6}\nstatus: todo\ntags: \[backend, urgent\]\nestimate: 90m\ncreated: 2026-09-26\ncompleted:\n---\n$/,
    );
    const [indexed] = plugin.tasks.all();
    expect(indexed).toMatchObject({ title: "Fix login bug", project: "Work/Backend", tags: ["backend", "urgent"] });
    expect(app.workspace.opened).toEqual([file!.path]);

    const again = await plugin.createTask({ title: "Fix login bug", project: "Work/Backend", tags: "", estimate: "" });
    expect(again?.path).toBe("Tasks/Work/Backend/Fix login bug (2).md");
  });

  it("uses the default project when none is given", async () => {
    const { plugin } = await setup();
    const file = await plugin.createTask({ title: "Call bank", project: " ", tags: "", estimate: "" });
    expect(file?.path).toBe("Tasks/Inbox/Call bank.md");
  });

  it("ignores notes without ids and notes in the log folder", async () => {
    const { plugin } = await setup({
      "Tasks/A.md": task("t-000001"),
      "Tasks/Plain.md": "just a note",
      "Tasks/_log/B.md": task("t-000002"),
      "Elsewhere/C.md": task("t-000003"),
    });
    expect(plugin.tasks.all().map((t) => t.id)).toEqual(["t-000001"]);
  });

  it("converts the current note into a task, keeping its frontmatter", async () => {
    const { app, plugin } = await setup({ "Tasks/Work/Note.md": "---\ncustom: keep\n---\nHello\n" });
    app.workspace.activeFile = app.vault.getFileByPath("Tasks/Work/Note.md");
    const cmd = command(plugin, "assign-missing-ids");
    expect(cmd.checkCallback!(true)).toBe(true);
    cmd.checkCallback!(false);
    await flush();
    const content = read(app, "Tasks/Work/Note.md");
    expect(content).toMatch(/^---\ncustom: keep\nid: t-[0-9a-f]{6}\nstatus: todo\ncreated: \d{4}-\d{2}-\d{2}\n---\nHello\n$/);
    expect(plugin.tasks.all()).toHaveLength(1);
    expect(cmd.checkCallback!(true)).toBe(false);
  });

  it("keeps the older duplicate, warns, and fixes the copy on request", async () => {
    const app = createMockApp();
    const older = await app.vault.create("Tasks/Original.md", task("t-aaaaaa"));
    const copy = await app.vault.create("Tasks/Original 1.md", task("t-aaaaaa"));
    older.stat.ctime = 1;
    copy.stat.ctime = 2;
    const plugin = await loadPlugin(TaskTrackerPlugin, manifest, { app });
    plugins.push(plugin);
    await flush();

    expect(plugin.tasks.get("t-aaaaaa")?.file).toBe(older);
    expect(notices.some((n) => n.includes("Tasks/Original.md") && n.includes("Tasks/Original 1.md"))).toBe(true);

    await plugin.fixDuplicateIds();
    expect(read(app, older.path)).toContain("id: t-aaaaaa");
    expect(read(app, copy.path)).not.toContain("id: t-aaaaaa");
    expect(plugin.tasks.all()).toHaveLength(2);
    expect(plugin.tasks.duplicates().size).toBe(0);
  });
});

describe("timer", () => {
  const files = { "Tasks/Work/Alpha.md": task("t-00000a"), "Tasks/Beta.md": task("t-00000b") };

  it("start → switch → stop writes two entries and updates status", async () => {
    const { app, plugin } = await setup(files);
    const alpha = plugin.tasks.get("t-00000a")!;
    const beta = plugin.tasks.get("t-00000b")!;

    setNow(new Date(2026, 8, 26, 9, 14));
    await plugin.timer.start(alpha);
    await flush();
    expect(read(app, alpha.file.path)).toContain("status: doing");
    expect(plugin.data.activeTimer?.taskId).toBe("t-00000a");

    setNow(new Date(2026, 8, 26, 10, 2));
    await plugin.timer.start(beta);
    setNow(new Date(2026, 8, 26, 10, 55));
    await plugin.timer.stop();
    await flush();

    expect(read(app, "Tasks/_log/2026-09-26.md")).toBe(
      "# 2026-09-26\n\n- 09:14–10:02 [[Alpha]] (t-00000a)\n- 10:02–10:55 [[Beta]] (t-00000b)\n",
    );
    expect(plugin.data.activeTimer).toBeNull();
    expect(plugin.time.forDate("2026-09-26")).toHaveLength(2);
    expect(read(app, beta.file.path)).toContain("status: doing");
  });

  it("starting the running task again is a no-op", async () => {
    const { plugin } = await setup(files);
    const alpha = plugin.tasks.get("t-00000a")!;
    await plugin.timer.start(alpha);
    const start = plugin.data.activeTimer!.start;
    setNow(new Date(2026, 8, 26, 9, 30));
    await plugin.timer.start(alpha);
    expect(plugin.data.activeTimer!.start).toBe(start);
  });

  it("splits entries at midnight into each day's note", async () => {
    setNow(new Date(2026, 8, 26, 23, 30));
    const { app, plugin } = await setup(files);
    await plugin.timer.start(plugin.tasks.get("t-00000a")!);
    setNow(new Date(2026, 8, 27, 0, 45));
    await plugin.timer.stop();
    expect(read(app, "Tasks/_log/2026-09-26.md")).toContain("- 23:30–23:59 [[Alpha]] (t-00000a)");
    expect(read(app, "Tasks/_log/2026-09-27.md")).toBe("# 2026-09-27\n\n- 00:00–00:45 [[Alpha]] (t-00000a)\n");
  });

  it("mark done stops the timer and sets completed", async () => {
    const { app, plugin } = await setup(files);
    const alpha = plugin.tasks.get("t-00000a")!;
    await plugin.timer.start(alpha);
    setNow(new Date(2026, 8, 26, 9, 30));
    await plugin.timer.setDone(plugin.tasks.get("t-00000a")!, true);
    await flush();
    expect(plugin.data.activeTimer).toBeNull();
    expect(read(app, alpha.file.path)).toBe(
      "---\nid: t-00000a\nstatus: done\ntags: [backend]\ncreated: 2026-09-26\ncompleted: 2026-09-26\n---\nBody\n",
    );
    expect(read(app, "Tasks/_log/2026-09-26.md")).toContain("- 09:00–09:30 [[Alpha]] (t-00000a)");

    await plugin.timer.setDone(plugin.tasks.get("t-00000a")!, false);
    expect(read(app, alpha.file.path)).toMatch(/status: todo\n.*completed:\n/s);
  });

  it("logs the entry when the running task is deleted", async () => {
    const { app, plugin } = await setup(files);
    await plugin.timer.start(plugin.tasks.get("t-00000a")!);
    setNow(new Date(2026, 8, 26, 9, 20));
    await app.vault.delete(app.vault.getFileByPath("Tasks/Work/Alpha.md")!);
    await flush();
    expect(plugin.data.activeTimer).toBeNull();
    expect(read(app, "Tasks/_log/2026-09-26.md")).toContain("- 09:00–09:20 [[Alpha]] (t-00000a)");
  });

  it("follows the id when the running task is renamed or moved", async () => {
    const { app, plugin } = await setup(files);
    await plugin.timer.start(plugin.tasks.get("t-00000a")!);
    await app.fileManager.renameFile(app.vault.getFileByPath("Tasks/Work/Alpha.md")!, "Tasks/Other/Alpha v2.md");
    setNow(new Date(2026, 8, 26, 9, 40));
    await plugin.timer.stop();
    expect(plugin.tasks.get("t-00000a")?.project).toBe("Other");
    expect(read(app, "Tasks/_log/2026-09-26.md")).toContain("- 09:00–09:40 [[Alpha v2]] (t-00000a)");
  });

  it("resumes a persisted timer and shows it in the status bar", async () => {
    const start = new Date(2026, 8, 26, 8, 0).toISOString();
    const { plugin } = await setup(files, { activeTimer: { taskId: "t-00000a", start } });
    plugin.tick(new Date(2026, 8, 26, 9, 23, 45).getTime());
    expect((plugin as unknown as { statusBarItems: HTMLElement[] }).statusBarItems[0]!.textContent).toBe(
      "⏱ Alpha · 1:23:45",
    );
    expect(openModals).toHaveLength(0);
  });

  it("picks up a timer and settings synced from another device", async () => {
    const { plugin } = await setup({ ...files, "Logs/2026-09-26.md": "# 2026-09-26\n\n- 08:00–08:30 [[Alpha]] (t-00000a)\n" });
    const settings = plugin.settings;
    const status = () => (plugin as unknown as { statusBarItems: HTMLElement[] }).statusBarItems[0]!.textContent;
    expect(status()).toBe("⏱ No task");

    const start = new Date(2026, 8, 26, 8, 50).toISOString();
    plugin.savedData = { settings: { ...settings, logFolder: "Logs" }, activeTimer: { taskId: "t-00000b", start } };
    await plugin.onExternalSettingsChange();
    expect(status()).toBe("⏱ Beta · 0:10:00");
    expect(plugin.timer.isRunning("t-00000b")).toBe(true);
    expect(settings.logFolder).toBe("Logs"); // same object, so the settings tab sees it too
    expect(plugin.time.forDate("2026-09-26")).toHaveLength(1);

    plugin.savedData = { settings, activeTimer: null };
    await plugin.onExternalSettingsChange();
    expect(status()).toBe("⏱ No task");
  });

  it("asks about a stale timer once, and Stop at… writes the chosen end", async () => {
    const start = new Date(2026, 8, 25, 18, 0);
    setNow(new Date(2026, 8, 26, 9, 0)); // 15 h later
    const { app, plugin } = await setup(files, { activeTimer: { taskId: "t-00000a", start: start.toISOString() } });
    expect(openModals).toHaveLength(1);
    const modal = staleModal();
    expect(modal).toBeInstanceOf(StaleTimerModal);
    expect(modal.contentEl.textContent).toContain("Alpha");

    plugin.tick();
    expect(openModals).toHaveLength(1);

    const stopAt = getSettings(modal.contentEl).find((s) => s.nameEl.textContent === "Stop at…")!;
    const [time, button] = stopAt.components as [TextComponent, ButtonComponent];
    expect(time.inputEl.type).toBe("datetime-local");

    // Outside start..now is rejected and the timer keeps running.
    await time.simulateChange("2026-09-25T17:00");
    await button.simulateClick();
    expect(modal.isOpen).toBe(true);
    expect(modal.contentEl.querySelector(".task-tracker-error")?.textContent).not.toBe("");

    await time.simulateChange("2026-09-25T19:30");
    await button.simulateClick();
    await flush();
    expect(modal.isOpen).toBe(false);
    expect(plugin.data.activeTimer).toBeNull();
    expect(read(app, "Tasks/_log/2026-09-25.md")).toBe("# 2026-09-25\n\n- 18:00–19:30 [[Alpha]] (t-00000a)\n");
  });

  it("keeps a stale timer running when asked", async () => {
    const start = new Date(2026, 8, 25, 18, 0);
    const { plugin } = await setup(files, { activeTimer: { taskId: "t-00000a", start: start.toISOString() } });
    staleModal().close();
    await flush();
    expect(plugin.data.activeTimer?.taskId).toBe("t-00000a");
  });

  it("preserves hand-written comment lines and ignores them in totals", async () => {
    const { app, plugin } = await setup({
      ...files,
      "Tasks/_log/2026-09-26.md": "# 2026-09-26\n\nMorning standup notes\n- 08:00–08:30 [[Alpha]] (t-00000a)\n",
    });
    expect(plugin.time.forDate("2026-09-26")).toHaveLength(1);
    await plugin.timer.start(plugin.tasks.get("t-00000b")!);
    setNow(new Date(2026, 8, 26, 9, 10));
    await plugin.timer.stop();
    await flush();
    expect(read(app, "Tasks/_log/2026-09-26.md")).toBe(
      "# 2026-09-26\n\nMorning standup notes\n- 08:00–08:30 [[Alpha]] (t-00000a)\n- 09:00–09:10 [[Beta]] (t-00000b)\n",
    );
    expect(plugin.time.forDate("2026-09-26").map((e) => e.endMin - e.startMin)).toEqual([30, 10]);
  });
});

describe("task view", () => {
  async function openView(files: Record<string, string>) {
    const ctx = await setup(files);
    await ctx.plugin.activateView();
    const leaf = ctx.app.workspace.getLeavesOfType(VIEW_TYPE)[0]!;
    return { ...ctx, view: leaf.view as unknown as TaskView };
  }

  const files = {
    "Tasks/Work/Alpha.md": task("t-00000a", "estimate: 1h30m\n"),
    "Tasks/Work/Backend/Gamma.md": task("t-00000c"),
    "Tasks/Home/Beta.md": "---\nid: t-00000b\nstatus: done\ntags: [home]\ncreated: 2026-09-26\n---\n",
    "Tasks/_log/2026-09-26.md": "# 2026-09-26\n\n- 08:00–08:35 [[Alpha]] (t-00000a)\n",
  };

  it("groups open tasks by nested project with totals and estimates", async () => {
    const { view } = await openView(files);
    const el = view.contentEl;
    const groups = [...el.querySelectorAll(".tt-group-name")].map((g) => g.textContent);
    expect(groups).toEqual(["Work", "Backend"]);
    expect(el.querySelector(".tt-group-total")?.textContent).toBe("35m");
    const titles = [...el.querySelectorAll(".tt-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Alpha", "Gamma"]);
    expect(el.querySelector(".tt-time")?.textContent).toBe("35m / 1h30m");
    expect(el.querySelector(".tt-totals")?.textContent).toContain("Today 35m");
  });

  it("filters by tag chip and updates when tags are edited by hand", async () => {
    const { app, view, plugin } = await openView(files);
    view.addTagFilter("backend");
    expect(view.getState().tags).toEqual(["backend"]);
    expect(plugin.savedData).toBeNull();
    expect(view.contentEl.querySelectorAll(".tt-row")).toHaveLength(2);

    const gamma = app.vault.getFileByPath("Tasks/Work/Backend/Gamma.md")!;
    await app.vault.modify(gamma, read(app, gamma.path).replace("tags: [backend]", "tags: [frontend]"));
    view.scheduleRender.run();
    expect([...view.contentEl.querySelectorAll(".tt-title")].map((t) => t.textContent)).toEqual(["Alpha"]);
  });

  it("collapses groups and keeps it in the view state Obsidian saves", async () => {
    const { app, view } = await openView(files);
    const save = vi.spyOn(app.workspace, "requestSaveLayout");
    view.contentEl.querySelector<HTMLElement>(".tt-group-header")!.click();
    expect(save).toHaveBeenCalled();
    expect(view.contentEl.querySelectorAll(".tt-row")).toHaveLength(0);

    // A layout restore hands the saved state to a fresh view.
    const leaf = new WorkspaceLeaf(app);
    await leaf.setViewState({ type: VIEW_TYPE, state: view.getState() });
    const restored = leaf.view as unknown as TaskView;
    expect(restored.getState()).toMatchObject({ status: "open", collapsed: ["Work"] });
    expect(restored.contentEl.querySelectorAll(".tt-row")).toHaveLength(0);
  });

  it("falls back to defaults for a malformed saved state", async () => {
    const { view } = await openView(files);
    await view.setState({ status: "bogus", tags: "backend", collapsed: ["Work", 3], range: "week" }, { history: false });
    expect(view.getState()).toEqual({ status: "open", tags: [], search: "", range: "week", collapsed: ["Work"] });
    expect(view.contentEl.querySelector<HTMLSelectElement>(".tt-status")!.value).toBe("open");
  });

  it("toggles done from the checkbox", async () => {
    const { app, view } = await openView(files);
    const box = view.contentEl.querySelector<HTMLInputElement>(".tt-row input[type=checkbox]")!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await flush();
    expect(read(app, "Tasks/Work/Alpha.md")).toContain("status: done");
  });
});

import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import type TaskTrackerPlugin from "./main";
import { ListSuggest } from "./ui/taskSuggest";

export interface TaskTrackerSettings {
  tasksRoot: string;
  logFolder: string;
  defaultProject: string;
  breakRemindersEnabled: boolean;
  breakIntervalMinutes: number;
  maxRunningHours: number;
}

export const DEFAULT_SETTINGS: TaskTrackerSettings = {
  tasksRoot: "Tasks",
  logFolder: "Tasks/_log",
  defaultProject: "Inbox",
  breakRemindersEnabled: true,
  breakIntervalMinutes: 50,
  maxRunningHours: 12,
};

function allFolders(app: App): string[] {
  return app.vault
    .getAllLoadedFiles()
    .filter((f): f is TFolder => f instanceof TFolder && f.path !== "/")
    .map((f) => f.path)
    .sort();
}

export class TaskTrackerSettingTab extends PluginSettingTab {
  plugin: TaskTrackerPlugin;

  constructor(app: App, plugin: TaskTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;
    const save = () => this.plugin.persist();

    const folder = (name: string, desc: string, key: "tasksRoot" | "logFolder") =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_SETTINGS[key])
            .setValue(settings[key])
            .onChange(async (value) => {
              settings[key] = value.trim();
              await save();
            });
          new ListSuggest(this.app, text.inputEl, () => allFolders(this.app));
        });

    folder("Tasks folder", "Root folder for task notes. Its sub-folders are projects.", "tasksRoot");
    folder("Log folder", "Where daily time logs are written. Excluded from the task list.", "logFolder");

    new Setting(containerEl)
      .setName("Default project")
      .setDesc("Used when a new task is created without a project.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.defaultProject)
          .setValue(settings.defaultProject)
          .onChange(async (value) => {
            settings.defaultProject = value.trim();
            await save();
          }),
      );

    const number = (name: string, desc: string, key: "breakIntervalMinutes" | "maxRunningHours") =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) => {
          text.inputEl.type = "number";
          text
            .setPlaceholder(String(DEFAULT_SETTINGS[key]))
            .setValue(String(settings[key]))
            .onChange(async (value) => {
              const n = Number(value);
              if (!Number.isFinite(n) || n <= 0) return;
              settings[key] = n;
              await save();
            });
        });

    new Setting(containerEl).setName("Timer").setHeading();
    number(
      "Stale timer threshold (hours)",
      "Ask what to do with a timer that has been running longer than this.",
      "maxRunningHours",
    );

    new Setting(containerEl).setName("Break reminders").setHeading();
    new Setting(containerEl)
      .setName("Remind me to take breaks")
      .setDesc("Show a notice after working for a while without a pause.")
      .addToggle((toggle) =>
        toggle.setValue(settings.breakRemindersEnabled).onChange(async (value) => {
          settings.breakRemindersEnabled = value;
          await save();
        }),
      );
    number("Break interval (minutes)", "Remind after this much continuous tracked time, and every multiple of it.", "breakIntervalMinutes");
  }

  override hide(): void {
    // Folder changes take effect once the user leaves the tab, not on every keystroke.
    void this.plugin.reindex();
  }
}

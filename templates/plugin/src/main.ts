import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, {{className}}SettingTab, type {{className}}Settings } from "./settings";

export default class {{className}}Plugin extends Plugin {
  override settings: {{className}}Settings = { ...DEFAULT_SETTINGS };

  override async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "show-greeting",
      name: "Show greeting",
      callback: () => this.showGreeting(),
    });

    this.addSettingTab(new {{className}}SettingTab(this.app, this));
  }

  showGreeting() {
    new Notice(this.settings.greeting);
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<{{className}}Settings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

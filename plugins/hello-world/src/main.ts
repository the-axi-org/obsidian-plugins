import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, HelloWorldSettingTab, type HelloWorldSettings } from "./settings";

export default class HelloWorldPlugin extends Plugin {
  override settings: HelloWorldSettings = { ...DEFAULT_SETTINGS };

  override async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "show-greeting",
      name: "Show greeting",
      callback: () => this.showGreeting(),
    });

    this.addSettingTab(new HelloWorldSettingTab(this.app, this));
  }

  showGreeting() {
    new Notice(this.settings.greeting);
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<HelloWorldSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

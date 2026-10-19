import { App, PluginSettingTab, Setting } from "obsidian";
import type {{className}}Plugin from "./main";

export interface {{className}}Settings {
  greeting: string;
}

export const DEFAULT_SETTINGS: {{className}}Settings = {
  greeting: "Hello from {{name}}!",
};

export class {{className}}SettingTab extends PluginSettingTab {
  plugin: {{className}}Plugin;

  constructor(app: App, plugin: {{className}}Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Greeting")
      .setDesc("Message shown by the show greeting command.")
      .addText((text) =>
        text.setValue(this.plugin.settings.greeting).onChange(async (value) => {
          this.plugin.settings.greeting = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}

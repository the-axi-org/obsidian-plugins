import { App, PluginSettingTab, Setting } from "obsidian";
import type HelloWorldPlugin from "./main";

export interface HelloWorldSettings {
  greeting: string;
}

export const DEFAULT_SETTINGS: HelloWorldSettings = {
  greeting: "Hello from Hello World!",
};

export class HelloWorldSettingTab extends PluginSettingTab {
  plugin: HelloWorldPlugin;

  constructor(app: App, plugin: HelloWorldPlugin) {
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

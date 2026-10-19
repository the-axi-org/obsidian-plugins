import { getSettings, loadPlugin, notices, TextComponent } from "@op/obsidian-mock";
import { beforeEach, describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import {{className}}Plugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

beforeEach(() => {
  notices.length = 0;
});

describe("{{name}}", () => {
  it("shows the default greeting", async () => {
    const plugin = await loadPlugin({{className}}Plugin, manifest);

    plugin.commands.find((c) => c.id === "show-greeting")?.callback?.();

    expect(notices).toEqual([DEFAULT_SETTINGS.greeting]);
  });

  it("merges saved settings over defaults", async () => {
    const plugin = await loadPlugin({{className}}Plugin, manifest, { data: { greeting: "Hi" } });

    expect(plugin.settings.greeting).toBe("Hi");
  });

  it("persists changes made in the settings tab", async () => {
    const plugin = await loadPlugin({{className}}Plugin, manifest);
    const tab = plugin.settingTabs[0]!;
    tab.display();

    const [greeting] = getSettings(tab.containerEl);
    expect(greeting?.nameEl.textContent).toBe("Greeting");
    const text = greeting?.components[0];
    expect(text).toBeInstanceOf(TextComponent);
    await (text as TextComponent).simulateChange("Hey there");

    expect(await plugin.loadData()).toEqual({ greeting: "Hey there" });
  });
});

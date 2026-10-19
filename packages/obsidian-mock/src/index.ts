// Minimal runtime stand-in for the `obsidian` module, aliased in vitest.config.ts.
// Extend it as plugins need more of the API; keep shapes compatible with obsidian.d.ts.

// Pulls in Obsidian's global DOM typings (createDiv, setText, ...), implemented at runtime by ./dom.ts.
/// <reference types="obsidian" />

/* eslint-disable @typescript-eslint/no-explicit-any */

type Callback = (...args: any[]) => any;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  [key: string]: unknown;
}

export interface Command {
  id: string;
  name: string;
  callback?: () => any;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: Callback;
  [key: string]: unknown;
}

// ---------- events / components ----------

export class Events {
  private handlers = new Map<string, Set<Callback>>();
  on(name: string, cb: Callback) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(cb);
    return { e: this, name, fn: cb };
  }
  off(name: string, cb: Callback) {
    this.handlers.get(name)?.delete(cb);
  }
  offref(ref: { name: string; fn: Callback }) {
    this.off(ref.name, ref.fn);
  }
  trigger(name: string, ...data: unknown[]) {
    for (const cb of this.handlers.get(name) ?? []) cb(...data);
  }
}

export class Component {
  private cleanups: (() => void)[] = [];
  private children: Component[] = [];
  load() {
    this.onload();
  }
  onload(): void | Promise<void> {}
  unload() {
    this.children.forEach((c) => c.unload());
    this.cleanups.splice(0).forEach((fn) => fn());
    this.onunload();
  }
  onunload() {}
  addChild<T extends Component>(child: T): T {
    this.children.push(child);
    child.load();
    return child;
  }
  removeChild<T extends Component>(child: T): T {
    this.children = this.children.filter((c) => c !== child);
    child.unload();
    return child;
  }
  register(cb: () => void) {
    this.cleanups.push(cb);
  }
  registerEvent(ref: { e: Events; name: string; fn: Callback }) {
    this.register(() => ref.e.offref(ref));
  }
  registerDomEvent(el: EventTarget, type: string, cb: Callback) {
    el.addEventListener(type, cb);
    this.register(() => el.removeEventListener(type, cb));
  }
  registerInterval(id: number) {
    this.register(() => clearInterval(id));
    return id;
  }
}

// ---------- vault / workspace / app ----------

export abstract class TAbstractFile {
  constructor(
    public vault: Vault,
    public path: string,
  ) {}
  get name() {
    return this.path.split("/").pop() ?? this.path;
  }
}

export class TFile extends TAbstractFile {
  stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };
  get basename() {
    return this.name.replace(/\.[^.]+$/, "");
  }
  get extension() {
    return this.name.includes(".") ? this.name.split(".").pop()! : "";
  }
}

export class TFolder extends TAbstractFile {}

/** In-memory vault. Seed it via `createMockApp({ files: { "a.md": "..." } })`. */
export class Vault extends Events {
  private contents = new Map<string, string>();
  private files = new Map<string, TFile>();

  getName() {
    return "test-vault";
  }
  getAbstractFileByPath(path: string): TFile | null {
    return this.files.get(normalizePath(path)) ?? null;
  }
  getFileByPath(path: string): TFile | null {
    return this.getAbstractFileByPath(path);
  }
  getFiles() {
    return [...this.files.values()];
  }
  getMarkdownFiles() {
    return this.getFiles().filter((f) => f.extension === "md");
  }
  async create(path: string, data: string) {
    path = normalizePath(path);
    if (this.files.has(path)) throw new Error("File already exists.");
    const file = new TFile(this, path);
    this.files.set(path, file);
    this.contents.set(path, data);
    this.trigger("create", file);
    return file;
  }
  async read(file: TFile) {
    return this.contents.get(file.path) ?? "";
  }
  async cachedRead(file: TFile) {
    return this.read(file);
  }
  async modify(file: TFile, data: string) {
    this.contents.set(file.path, data);
    file.stat.mtime = Date.now();
    this.trigger("modify", file);
  }
  async process(file: TFile, fn: (data: string) => string) {
    const next = fn(await this.read(file));
    await this.modify(file, next);
    return next;
  }
  async delete(file: TFile) {
    this.files.delete(file.path);
    this.contents.delete(file.path);
    this.trigger("delete", file);
  }
}

export class Workspace extends Events {
  activeFile: TFile | null = null;
  getActiveFile() {
    return this.activeFile;
  }
  onLayoutReady(cb: () => void) {
    cb();
  }
}

export class App {
  vault = new Vault();
  workspace = new Workspace();
}

// ---------- plugin ----------

export class Plugin extends Component {
  /** Test-only introspection (not part of the real API). */
  readonly commands: Command[] = [];
  readonly settingTabs: PluginSettingTab[] = [];
  readonly ribbonIcons: { icon: string; title: string; callback: Callback; el: HTMLElement }[] = [];
  data: unknown = null;

  constructor(
    public app: App,
    public manifest: PluginManifest,
  ) {
    super();
  }
  addCommand(command: Command) {
    this.commands.push(command);
    return command;
  }
  addSettingTab(tab: PluginSettingTab) {
    this.settingTabs.push(tab);
  }
  addRibbonIcon(icon: string, title: string, callback: Callback) {
    const el = document.createElement("div");
    this.ribbonIcons.push({ icon, title, callback, el });
    return el;
  }
  addStatusBarItem() {
    return document.createElement("div");
  }
  async loadData(): Promise<any> {
    return structuredClone(this.data);
  }
  async saveData(data: unknown) {
    this.data = structuredClone(data);
  }
  registerView() {}
  registerMarkdownPostProcessor() {}
  registerMarkdownCodeBlockProcessor() {}
  registerEditorExtension() {}
}

// ---------- UI ----------

/** Every `new Notice(...)` lands here; clear it in `beforeEach` if you assert on it. */
export const notices: string[] = [];

export class Notice {
  noticeEl = document.createElement("div");
  constructor(
    public message: string | DocumentFragment,
    public duration?: number,
  ) {
    notices.push(typeof message === "string" ? message : (message.textContent ?? ""));
  }
  setMessage(message: string) {
    this.message = message;
    return this;
  }
  hide() {}
}

export class Modal {
  containerEl = document.createElement("div");
  modalEl = this.containerEl.createDiv();
  titleEl = this.modalEl.createDiv();
  contentEl = this.modalEl.createDiv();
  isOpen = false;
  constructor(public app: App) {}
  open() {
    this.isOpen = true;
    this.onOpen();
  }
  close() {
    this.isOpen = false;
    this.onClose();
  }
  onOpen() {}
  onClose() {}
  setTitle(title: string) {
    this.titleEl.setText(title);
    return this;
  }
}

export abstract class PluginSettingTab {
  containerEl = document.createElement("div");
  constructor(
    public app: App,
    public plugin: Plugin,
  ) {}
  abstract display(): void;
  hide() {}
}

class ValueComponent<T> {
  value: T;
  disabled = false;
  private handler?: (value: T) => any;
  constructor(initial: T) {
    this.value = initial;
  }
  getValue() {
    return this.value;
  }
  setValue(value: T) {
    this.value = value;
    return this;
  }
  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    return this;
  }
  setPlaceholder(_: string) {
    return this;
  }
  onChange(cb: (value: T) => any) {
    this.handler = cb;
    return this;
  }
  /** Test helper: simulate the user changing the value. */
  async simulateChange(value: T) {
    this.value = value;
    await this.handler?.(value);
  }
}

export class TextComponent extends ValueComponent<string> {}
export class TextAreaComponent extends ValueComponent<string> {}
export class ToggleComponent extends ValueComponent<boolean> {}
export class SliderComponent extends ValueComponent<number> {
  setLimits() {
    return this;
  }
  setDynamicTooltip() {
    return this;
  }
}
export class DropdownComponent extends ValueComponent<string> {
  options: Record<string, string> = {};
  addOption(value: string, display: string) {
    this.options[value] = display;
    return this;
  }
  addOptions(options: Record<string, string>) {
    Object.assign(this.options, options);
    return this;
  }
}
export class ButtonComponent {
  buttonText = "";
  private handler?: Callback;
  setButtonText(text: string) {
    this.buttonText = text;
    return this;
  }
  setCta() {
    return this;
  }
  setWarning() {
    return this;
  }
  onClick(cb: Callback) {
    this.handler = cb;
    return this;
  }
  /** Test helper. */
  async simulateClick() {
    await this.handler?.();
  }
}

const settingsByEl = new WeakMap<Element, Setting>();

/** Test helper: the Settings rendered inside `containerEl`, in DOM order. */
export function getSettings(containerEl: HTMLElement): Setting[] {
  return [...containerEl.querySelectorAll(".setting-item")].flatMap((el) => {
    const setting = settingsByEl.get(el);
    return setting ? [setting] : [];
  });
}

export class Setting {
  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  /** Test-only: components added via addText/addToggle/... in order. */
  readonly components: unknown[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
    settingsByEl.set(this.settingEl, this);
    this.nameEl = this.settingEl.createDiv({ cls: "setting-item-name" });
    this.descEl = this.settingEl.createDiv({ cls: "setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
  }
  setName(name: string) {
    this.nameEl.setText(name);
    return this;
  }
  setDesc(desc: string) {
    this.descEl.setText(desc);
    return this;
  }
  setHeading() {
    this.settingEl.addClass("setting-item-heading");
    return this;
  }
  private add<C>(component: C, cb: (c: C) => any) {
    this.components.push(component);
    cb(component);
    return this;
  }
  addText(cb: (c: TextComponent) => any) {
    return this.add(new TextComponent(""), cb);
  }
  addTextArea(cb: (c: TextAreaComponent) => any) {
    return this.add(new TextAreaComponent(""), cb);
  }
  addToggle(cb: (c: ToggleComponent) => any) {
    return this.add(new ToggleComponent(false), cb);
  }
  addSlider(cb: (c: SliderComponent) => any) {
    return this.add(new SliderComponent(0), cb);
  }
  addDropdown(cb: (c: DropdownComponent) => any) {
    return this.add(new DropdownComponent(""), cb);
  }
  addButton(cb: (c: ButtonComponent) => any) {
    return this.add(new ButtonComponent(), cb);
  }
}

// ---------- utils ----------

export function normalizePath(path: string) {
  return path.replace(/[\\/]+/g, "/").replace(/^\/|\/$/g, "") || "/";
}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isMacOS: false,
  isWin: false,
  isLinux: true,
};

// ---------- test helpers ----------

export function createMockApp({ files = {} }: { files?: Record<string, string> } = {}) {
  const app = new App();
  for (const [path, data] of Object.entries(files)) void app.vault.create(path, data);
  return app;
}

/**
 * Instantiate and load a plugin the way Obsidian would.
 * The returned instance is typed as both your plugin and the mock (for introspection helpers).
 */
export async function loadPlugin<P>(
  PluginClass: new (app: any, manifest: any) => P,
  manifest: PluginManifest,
  { app = createMockApp(), data = null }: { app?: App; data?: unknown } = {},
): Promise<P & Plugin> {
  const plugin = new PluginClass(app, manifest) as P & Plugin;
  plugin.data = structuredClone(data);
  await plugin.onload();
  return plugin;
}

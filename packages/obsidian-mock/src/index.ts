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
  /** Explicit folders; parents of files count as folders too. */
  private folders = new Map<string, TFolder>();

  getName() {
    return "test-vault";
  }
  getAbstractFileByPath(path: string): TAbstractFile | null {
    path = normalizePath(path);
    return this.files.get(path) ?? this.getFolderByPath(path);
  }
  getFileByPath(path: string): TFile | null {
    return this.files.get(normalizePath(path)) ?? null;
  }
  getFolderByPath(path: string): TFolder | null {
    path = normalizePath(path);
    if (!this.folders.has(path) && [...this.files.keys()].some((p) => p.startsWith(`${path}/`))) {
      this.folders.set(path, new TFolder(this, path));
    }
    return this.folders.get(path) ?? null;
  }
  getFiles() {
    return [...this.files.values()];
  }
  getMarkdownFiles() {
    return this.getFiles().filter((f) => f.extension === "md");
  }
  getAllLoadedFiles(): TAbstractFile[] {
    for (const path of this.files.keys()) {
      const parts = path.split("/").slice(0, -1);
      parts.forEach((_, i) => this.getFolderByPath(parts.slice(0, i + 1).join("/")));
    }
    return [...this.folders.values(), ...this.files.values()];
  }
  async createFolder(path: string) {
    path = normalizePath(path);
    if (this.getAbstractFileByPath(path)) throw new Error("Folder already exists.");
    const folder = new TFolder(this, path);
    this.folders.set(path, folder);
    this.trigger("create", folder);
    return folder;
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
  /** Moves a file. Folder renames only move the folder entry, not its children. */
  async rename(file: TAbstractFile, newPath: string) {
    const oldPath = file.path;
    newPath = normalizePath(newPath);
    if (file instanceof TFile) {
      const data = this.contents.get(oldPath) ?? "";
      this.files.delete(oldPath);
      this.contents.delete(oldPath);
      this.files.set(newPath, file);
      this.contents.set(newPath, data);
    } else if (file instanceof TFolder) {
      this.folders.delete(oldPath);
      this.folders.set(newPath, file);
    }
    file.path = newPath;
    this.trigger("rename", file, oldPath);
  }
  async read(file: TFile) {
    return this.readNow(file);
  }
  /** Mock-only synchronous read, also handy for assertions. */
  readNow(file: TFile | string) {
    return this.contents.get(typeof file === "string" ? normalizePath(file) : file.path) ?? "";
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

// ---------- frontmatter ----------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/;

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "" || v === "null" || v === "~") return null;
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('"')) return JSON.parse(v) as unknown;
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(",").map((s) => parseScalar(s)) : [];
  }
  return v;
}

/**
 * Small YAML subset: `key: scalar`, flow lists `[a, b]`, block lists (`- a`), quoted strings.
 * Enough for frontmatter in tests; dates stay strings.
 */
export function parseYaml(text: string): any {
  const out: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      // A bare `key:` is null until a list item follows it.
      const list = Array.isArray(out[listKey]) ? (out[listKey] as unknown[]) : [];
      list.push(parseScalar(item[1]!));
      out[listKey] = list;
      continue;
    }
    const kv = /^([^:#\s-][^:]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv as unknown as [string, string, string];
    listKey = value.trim() === "" ? key : null;
    out[key] = parseScalar(value);
  }
  return out;
}

function yamlValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return `[${v.map(yamlValue).join(", ")}]`;
  if (typeof v === "string") return /^[\w./-]+$/.test(v) && !/^(-?\d+(\.\d+)?|true|false|null)$/.test(v) ? v : JSON.stringify(v);
  return String(v);
}

export function stringifyYaml(obj: any): string {
  return Object.entries(obj as Record<string, unknown>)
    .map(([k, v]) => `${k}:${v === null || v === undefined ? "" : ` ${yamlValue(v)}`}`)
    .join("\n")
    .concat("\n");
}

export function getFrontMatterInfo(content: string) {
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
  const from = m[0].indexOf("\n") + 1;
  return { exists: true, frontmatter: m[1]!, from, to: from + m[1]!.length, contentStart: m[0].length };
}

export interface CachedMetadata {
  frontmatter?: Record<string, any>;
}

/** Parses frontmatter whenever the vault creates or modifies a file, then fires "changed". */
export class MetadataCache extends Events {
  private cache = new Map<string, CachedMetadata>();
  constructor(private vault: Vault) {
    super();
    const update = (file: TAbstractFile) => {
      if (!(file instanceof TFile)) return;
      const data = vault.readNow(file);
      const fm = getFrontMatterInfo(data);
      const meta: CachedMetadata = fm.exists ? { frontmatter: parseYaml(fm.frontmatter) } : {};
      this.cache.set(file.path, meta);
      this.trigger("changed", file, data, meta);
    };
    vault.on("create", update);
    vault.on("modify", update);
    vault.on("rename", (file: TAbstractFile, oldPath: string) => {
      const meta = this.cache.get(oldPath);
      this.cache.delete(oldPath);
      if (meta) this.cache.set(file.path, meta);
    });
    vault.on("delete", (file: TAbstractFile) => this.cache.delete(file.path));
  }
  getFileCache(file: TFile): CachedMetadata | null {
    return this.cache.get(file.path) ?? null;
  }
}

export class FileManager {
  constructor(private vault: Vault) {}
  /** Rewrites the frontmatter block, keeping the body. Key order is preserved. */
  async processFrontMatter(file: TFile, fn: (frontmatter: any) => void) {
    await this.vault.process(file, (data) => {
      const info = getFrontMatterInfo(data);
      const fm = info.exists ? parseYaml(info.frontmatter) : {};
      fn(fm);
      return `---\n${stringifyYaml(fm)}---\n${data.slice(info.contentStart)}`;
    });
  }
  async renameFile(file: TFile, newPath: string) {
    await this.vault.rename(file, newPath);
  }
}

// ---------- workspace ----------

export class WorkspaceLeaf {
  view: View | null = null;
  constructor(public app: App) {}
  async openFile(file: TFile) {
    this.app.workspace.activeFile = file;
    this.app.workspace.opened.push(file.path);
  }
  async setViewState({ type, state }: ViewState, _eState?: any) {
    const factory = this.app.workspace.viewFactories.get(type);
    if (!factory) throw new Error(`No view registered for ${type}`);
    this.view = factory(this);
    await this.view.onOpen();
    await this.view.setState(state ?? {}, { history: false });
  }
  getViewState(): ViewState {
    return { type: this.view?.getViewType() ?? "empty", state: this.view?.getState() ?? {} };
  }
}

export interface ViewState {
  type: string;
  state?: Record<string, unknown>;
  active?: boolean;
  pinned?: boolean;
  group?: WorkspaceLeaf;
}

export interface ViewStateResult {
  history: boolean;
}

export class Workspace extends Events {
  activeFile: TFile | null = null;
  /** Test-only: paths passed to `openFile`, in order. */
  readonly opened: string[] = [];
  /** Test-only: populated by `Plugin.registerView`. */
  readonly viewFactories = new Map<string, (leaf: WorkspaceLeaf) => View>();
  private leaves: WorkspaceLeaf[] = [];
  requestSaveLayout: Debouncer<[], Promise<void>> = debounce(async () => {}, 0);
  constructor(private app: App) {
    super();
  }
  getActiveFile() {
    return this.activeFile;
  }
  onLayoutReady(cb: () => void) {
    cb();
  }
  getLeaf(_newLeaf?: unknown) {
    return new WorkspaceLeaf(this.app);
  }
  getLeavesOfType(type: string) {
    return this.leaves.filter((l) => l.view?.getViewType() === type);
  }
  async ensureSideLeaf(type: string, _side: string, _options?: unknown) {
    const existing = this.getLeavesOfType(type)[0];
    if (existing) return existing;
    const leaf = new WorkspaceLeaf(this.app);
    this.leaves.push(leaf);
    await leaf.setViewState({ type });
    return leaf;
  }
  async revealLeaf(_leaf: WorkspaceLeaf) {}
}

export class App {
  vault = new Vault();
  workspace = new Workspace(this);
  metadataCache = new MetadataCache(this.vault);
  fileManager = new FileManager(this.vault);
}

export abstract class View extends Component {
  app: App;
  containerEl = document.createElement("div");
  constructor(public leaf: WorkspaceLeaf) {
    super();
    this.app = leaf.app;
  }
  abstract getViewType(): string;
  abstract getDisplayText(): string;
  getIcon() {
    return "";
  }
  getState(): Record<string, unknown> {
    return {};
  }
  async setState(_state: unknown, _result: ViewStateResult) {}
  async onOpen() {}
  async onClose() {}
}

export abstract class ItemView extends View {
  contentEl: HTMLElement;
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.containerEl.createDiv({ cls: "view-header" });
    this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
  }
}

// ---------- plugin ----------

export class Plugin extends Component {
  /** Test-only introspection (not part of the real API). */
  readonly commands: Command[] = [];
  readonly settingTabs: PluginSettingTab[] = [];
  readonly ribbonIcons: { icon: string; title: string; callback: Callback; el: HTMLElement }[] = [];
  /** Test-only: the contents of `data.json`. */
  savedData: unknown = null;

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
  readonly statusBarItems: HTMLElement[] = [];
  addStatusBarItem() {
    const el = document.createElement("div");
    this.statusBarItems.push(el);
    return el;
  }
  async loadData(): Promise<any> {
    return structuredClone(this.savedData);
  }
  async saveData(data: unknown) {
    this.savedData = structuredClone(data);
  }
  onExternalSettingsChange?(): any;
  registerView(type: string, factory: (leaf: WorkspaceLeaf) => View) {
    this.app.workspace.viewFactories.set(type, factory);
  }
  registerHoverLinkSource(_id: string, _info: { display: string; defaultMod: boolean }) {}
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

/** Every opened modal lands here; clear it in `beforeEach` if you assert on it. */
export const openModals: Modal[] = [];

export class Modal {
  containerEl = document.createElement("div");
  modalEl = this.containerEl.createDiv();
  titleEl = this.modalEl.createDiv();
  contentEl = this.modalEl.createDiv();
  isOpen = false;
  constructor(public app: App) {}
  open() {
    this.isOpen = true;
    openModals.push(this);
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

export abstract class SuggestModal<T> extends Modal {
  placeholder = "";
  setPlaceholder(placeholder: string) {
    this.placeholder = placeholder;
  }
  abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

export interface FuzzyMatch<T> {
  item: T;
  match: { score: number; matches: [number, number][] };
}

export abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
  abstract getItems(): T[];
  abstract getItemText(item: T): string;
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
  /** Case-insensitive substring match; good enough for tests. */
  getSuggestions(query: string): FuzzyMatch<T>[] {
    const q = query.toLowerCase();
    return this.getItems()
      .filter((item) => this.getItemText(item).toLowerCase().includes(q))
      .map((item) => ({ item, match: { score: 0, matches: [] } }));
  }
  renderSuggestion(value: FuzzyMatch<T>, el: HTMLElement) {
    el.setText(this.getItemText(value.item));
  }
  onChooseSuggestion(value: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent) {
    this.onChooseItem(value.item, evt);
  }
}

/** Type-ahead attached to an input. Tests call `getSuggestions`/`selectSuggestion` directly. */
export abstract class AbstractInputSuggest<T> {
  limit = 100;
  constructor(
    public app: App,
    protected textInputEl: HTMLInputElement | HTMLDivElement,
  ) {}
  protected abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent) {}
  setValue(value: string) {
    if (this.textInputEl instanceof HTMLInputElement) this.textInputEl.value = value;
  }
  getValue() {
    return this.textInputEl instanceof HTMLInputElement ? this.textInputEl.value : "";
  }
  open() {}
  close() {}
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

export class TextComponent extends ValueComponent<string> {
  inputEl = document.createElement("input");
  constructor(initial: string) {
    super(initial);
    // Like Obsidian, typing (an `input` event) reaches onChange.
    this.inputEl.addEventListener("input", () => void this.simulateChange(this.inputEl.value));
  }
  override setValue(value: string) {
    this.inputEl.value = value;
    return super.setValue(value);
  }
  override async simulateChange(value: string) {
    this.inputEl.value = value;
    await super.simulateChange(value);
  }
}
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
    const text = new TextComponent("");
    this.controlEl.appendChild(text.inputEl);
    return this.add(text, cb);
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

export function setIcon(parent: HTMLElement, iconId: string) {
  parent.dataset.icon = iconId;
}

export interface Debouncer<T extends unknown[], V> {
  (...args: [...T]): Debouncer<T, V>;
  cancel(): Debouncer<T, V>;
  run(): V | void;
}

/** Same contract as Obsidian's `debounce`; use fake timers or `run()` in tests. */
export function debounce<T extends unknown[], V>(
  cb: (...args: [...T]) => V,
  timeout = 0,
  resetTimer = false,
): Debouncer<T, V> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  const fire = () => {
    timer = null;
    const args = pending;
    pending = null;
    return args ? cb(...args) : undefined;
  };
  const debounced = ((...args: T) => {
    pending = args;
    if (timer && resetTimer) clearTimeout(timer);
    if (!timer || resetTimer) timer = setTimeout(fire, timeout);
    return debounced;
  }) as Debouncer<T, V>;
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    return debounced;
  };
  debounced.run = () => {
    if (timer) clearTimeout(timer);
    return fire();
  };
  return debounced;
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
  plugin.savedData = structuredClone(data);
  await plugin.onload();
  return plugin;
}

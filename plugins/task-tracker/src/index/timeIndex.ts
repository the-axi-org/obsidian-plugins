import { App, Events, TFile, type TAbstractFile } from "obsidian";
import { DATE_RE, parseLog, type LogEntry } from "../model/log";
import { normalizeFolder } from "../model/task";

/**
 * Time entries parsed from the daily log notes, grouped by date.
 *
 * Events: "changed" after any log note is (re)parsed or removed.
 */
export class TimeIndex extends Events {
  private byDate = new Map<string, LogEntry[]>();

  constructor(
    private app: App,
    private logFolder: () => string,
  ) {
    super();
  }

  entries(): LogEntry[] {
    return [...this.byDate.values()].flat();
  }

  forDate(date: string): LogEntry[] {
    return this.byDate.get(date) ?? [];
  }

  /** The date a path stands for if it's a log note (`{logFolder}/YYYY-MM-DD.md`), else null. */
  dateOf(path: string): string | null {
    const folder = normalizeFolder(this.logFolder());
    const prefix = folder ? `${folder}/` : "";
    if (!path.startsWith(prefix)) return null;
    const name = path.slice(prefix.length);
    if (!name.endsWith(".md")) return null;
    const date = name.slice(0, -3);
    return DATE_RE.test(date) ? date : null;
  }

  async build(): Promise<void> {
    const next = new Map<string, LogEntry[]>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const date = this.dateOf(file.path);
      if (date) next.set(date, parseLog(await this.app.vault.cachedRead(file), date));
    }
    this.byDate = next;
    this.trigger("changed");
  }

  watch(register: (ref: ReturnType<Events["on"]>) => void): void {
    const { vault } = this.app;
    const reparse = (file: TAbstractFile) => {
      if (file instanceof TFile) void this.reparse(file);
    };
    register(vault.on("modify", reparse));
    register(vault.on("create", reparse));
    register(
      vault.on("delete", (file) => {
        const date = this.dateOf(file.path);
        if (date && this.byDate.delete(date)) this.trigger("changed");
      }),
    );
    register(
      vault.on("rename", (file, oldPath) => {
        // Obsidian follows a folder rename with one event per descendant, but rebuild anyway in
        // case a move doesn't (forum reports differ).
        if (!(file instanceof TFile)) {
          void this.build();
          return;
        }
        const old = this.dateOf(oldPath);
        if (old) this.byDate.delete(old);
        if (this.dateOf(file.path)) void this.reparse(file);
        else if (old) this.trigger("changed");
      }),
    );
  }

  private async reparse(file: TFile) {
    const date = this.dateOf(file.path);
    if (!date) return;
    this.byDate.set(date, parseLog(await this.app.vault.read(file), date));
    this.trigger("changed");
  }
}

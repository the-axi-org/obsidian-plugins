import { Modal, Setting, type App } from "obsidian";
import { dateKey, formatHHMM } from "../model/log";

export interface StaleTimerChoice {
  /** null keeps the timer running. */
  stopAt: Date | null;
}

/** Value for an `<input type="datetime-local">`, in local time. */
export function toDatetimeLocal(d: Date): string {
  return `${dateKey(d)}T${formatHHMM(d.getHours() * 60 + d.getMinutes())}`;
}

/** Asks what to do with a timer that has run longer than the configured threshold. */
export class StaleTimerModal extends Modal {
  private done = false;

  constructor(
    app: App,
    private opts: { title: string; start: Date; onChoose: (choice: StaleTimerChoice) => void },
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    const { title, start } = this.opts;
    this.setTitle("Timer still running");
    const p = contentEl.createEl("p");
    p.appendText("Timer on ");
    p.createEl("em", { text: title });
    p.appendText(` has been running since ${start.toLocaleString()}.`);

    new Setting(contentEl).setName("Stop now").addButton((btn) =>
      btn
        .setButtonText("Stop now")
        .setCta()
        .onClick(() => this.choose(new Date())),
    );

    let stopAt = "";
    const error = contentEl.createDiv({ cls: "task-ledger-error" });
    new Setting(contentEl)
      .setName("Stop at…")
      .setDesc("When did you actually stop?")
      .addText((text) => {
        text.inputEl.type = "datetime-local";
        text.inputEl.min = toDatetimeLocal(start);
        text.inputEl.max = toDatetimeLocal(new Date());
        text.setValue(toDatetimeLocal(start)).onChange((value) => (stopAt = value));
        stopAt = text.getValue();
      })
      .addButton((btn) =>
        btn.setButtonText("Stop at this time").onClick(() => {
          const at = new Date(stopAt);
          // The input has minute precision, so compare against the start's minute.
          const startMinute = Math.floor(start.getTime() / 60_000) * 60_000;
          if (Number.isNaN(at.getTime()) || at.getTime() < startMinute || at > new Date()) {
            error.setText("Pick a time between the start and now.");
            return;
          }
          this.choose(at);
        }),
      );

    new Setting(contentEl).setName("Keep running").addButton((btn) =>
      btn.setButtonText("Keep running").onClick(() => this.close()),
    );
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.done) this.opts.onChoose({ stopAt: null });
  }

  private choose(stopAt: Date) {
    this.done = true;
    this.opts.onChoose({ stopAt });
    this.close();
  }
}

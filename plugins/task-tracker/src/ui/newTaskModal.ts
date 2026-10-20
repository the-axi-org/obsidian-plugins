import { Modal, Setting, type App } from "obsidian";
import { ListSuggest } from "./taskSuggest";

export interface NewTaskInput {
  title: string;
  project: string;
  tags: string;
  estimate: string;
}

export class NewTaskModal extends Modal {
  private values: NewTaskInput = { title: "", project: "", tags: "", estimate: "" };

  constructor(
    app: App,
    private opts: {
      defaultProject: string;
      projects: () => string[];
      onSubmit: (input: NewTaskInput) => Promise<void>;
    },
  ) {
    super(app);
    this.values.project = opts.defaultProject;
  }

  override onOpen(): void {
    this.setTitle("New task");
    const { contentEl } = this;
    contentEl.addClass("task-tracker-new-task");

    const field = (name: string, key: keyof NewTaskInput, placeholder: string, focus = false) =>
      new Setting(contentEl).setName(name).addText((text) => {
        text
          .setPlaceholder(placeholder)
          .setValue(this.values[key])
          .onChange((value) => {
            this.values[key] = value;
          });
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            void this.submit();
          }
        });
        // Picking a suggestion fires `input`, which TextComponent forwards to onChange.
        if (key === "project") new ListSuggest(this.app, text.inputEl, this.opts.projects);
        if (focus) window.setTimeout(() => text.inputEl.focus(), 0);
      });

    field("Title", "title", "What needs doing?", true);
    field("Project", "project", this.opts.defaultProject || "No project");
    field("Tags", "tags", "Comma-separated, e.g. backend, urgent");
    field("Estimate", "estimate", "E.g. 90m, 1h30m, 1.5h");

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Create")
        .setCta()
        .onClick(() => this.submit()),
    );
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async submit() {
    if (!this.values.title.trim()) return;
    this.close();
    await this.opts.onSubmit({ ...this.values });
  }
}

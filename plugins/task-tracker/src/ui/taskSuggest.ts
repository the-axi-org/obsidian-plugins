import { AbstractInputSuggest, FuzzySuggestModal, type App } from "obsidian";
import type { Task } from "../index/taskIndex";

/** Fuzzy picker over tasks. */
export class TaskSuggestModal extends FuzzySuggestModal<Task> {
  constructor(
    app: App,
    private tasks: Task[],
    private onPick: (task: Task) => void,
  ) {
    super(app);
    this.setPlaceholder("Start timer on…");
  }

  override getItems(): Task[] {
    return this.tasks;
  }

  override getItemText(task: Task): string {
    return task.project ? `${task.title} (${task.project})` : task.title;
  }

  override onChooseItem(task: Task): void {
    this.onPick(task);
  }
}

/**
 * Type-ahead over a list of strings (folders, projects). Picking a suggestion fills the input
 * and fires an `input` event, so listeners on the input see it like typing; any typed value is
 * still accepted.
 */
export class ListSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private inputEl: HTMLInputElement,
    private items: () => string[],
  ) {
    super(app, inputEl);
  }

  protected override getSuggestions(query: string): string[] {
    const q = query.toLowerCase();
    return this.items().filter((p) => p.toLowerCase().includes(q));
  }

  override renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  override selectSuggestion(value: string): void {
    this.inputEl.value = value;
    this.inputEl.dispatchEvent(new Event("input"));
    this.close();
  }
}

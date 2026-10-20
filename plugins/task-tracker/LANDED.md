# Task Tracker: what landed

Compared against [`SPEC.md`](SPEC.md). Status as of 2026-10-20: `pnpm typecheck`, `pnpm lint`, `pnpm test` (100 tests) and `pnpm build` pass. The manual checklist in [`TESTING.md`](TESTING.md) has **not** been run in Obsidian yet.

## Landed

All five milestones from SPEC §12.

| Spec | Where |
|---|---|
| §3 Settings, with a settings tab and folder suggestions | `src/settings.ts` |
| §4.1 Task note read/write helpers | `src/model/task.ts`, `src/model/ids.ts`, `src/model/duration.ts` |
| §4.2 Log line grammar, append, midnight split | `src/model/log.ts` |
| §5.1 Task index, duplicate-id Notice, "Fix duplicate task ids" | `src/index/taskIndex.ts`, `src/main.ts` |
| §5.2 Time index and aggregation (task, project with and without nesting, tag; today/week/all) | `src/index/timeIndex.ts`, `src/model/aggregate.ts` |
| §6 Timer state machine, status bar, restart, stale-timer modal (once per load) | `src/timer/timer.ts`, `src/ui/staleTimerModal.ts`, `src/main.ts` |
| §7 All nine commands, no default hotkeys | `src/main.ts` |
| §8 Sidebar task view | `src/ui/taskView.ts`, `styles.css` |
| §9 Break reminders | `src/timer/breaks.ts` |
| §11 Unit tests for duration, log, midnight split and aggregate; `TESTING.md` | `test/*.test.ts`, `TESTING.md` |
| §12 `CHANGELOG.md`, and a README with usage and file formats | `CHANGELOG.md`, `README.md` |

On-disk formats (task frontmatter, log lines, `activeTimer`) match the spec exactly.

## Open questions (§13), as answered

- **Show the note body in the view?** Yes, as a hover preview. Hovering a title shows Obsidian's page preview without a modifier key; registered as hover source "Task tracker", changeable under Settings → Page preview.
- **Archive or move done tasks?** No. They stay in place, and the status filter hides them by default.

## Deviations from the spec

**Repo conventions override the spec**
- Scaffolded with `pnpm new` from `templates/plugin` instead of `obsidian-sample-plugin`. It builds through the shared esbuild pipeline in `packages/build`.
- Builds and checks run through `pnpm build`, `pnpm test`, `pnpm typecheck` and `pnpm lint`, not `npm run build`.
- The tests folder is `test/` rather than §10's `tests/`. This is naming only: the repo's Vitest, tsconfig and ESLint configs all expect `test/`.

**Beyond §10's "pure modules only"**
- `test/plugin.test.ts` also tests the Obsidian-facing wiring (commands, timer log writes, indexes, the view) against `@op/obsidian-mock`. I read "pure modules only" as describing which code is unit-testable, not as a ban. If it was meant strictly, this file is the deviation, and it can be removed without affecting the required tests.

**Choices where the spec was silent or ambiguous**
- **Plugin data layout:** `data.json` is `{ settings, activeTimer }`. The spec stores both in plugin data without saying how they're arranged. Grouping the settings under one key keeps them separate from runtime state. This is nested rather than the sample plugin's flat settings object.
- **View filters and collapsed groups** are view state (`getState`/`setState`), which Obsidian saves per leaf in `workspace.json`, following Obsidian convention. They stay on each device rather than syncing through `data.json`.
- **Synced timer:** `onExternalSettingsChange` reloads `data.json` when Sync changes it, so a timer started or stopped on another device shows up without a restart. It also re-indexes if the folder settings changed. Concurrent changes on two devices resolve as last write wins:
  - A stop whose log write is still in flight when Sync brings in a different timer keeps the synced timer rather than clearing it.
  - The stale-timer dialog remembers the timer it asked about (task id and start). If Sync has replaced that timer by the time you choose, the choice is ignored.
  - Starting a task locally still replaces a synced timer. If two devices both stop the same timer before syncing, each writes a log entry, so that time counts twice.
- **Folder renames:** renaming or moving a folder rebuilds both indexes. Obsidian also sends a rename event for each file inside the folder, which already keeps the indexes current, so the rebuild is a safety net for moves that may only send one event. Renaming the log folder in the vault without changing the setting leaves the time index empty until the setting is updated, as the setting names the folder.
- **"Stop at…" takes a date and time** (`datetime-local`), not just a time. A stale timer has usually crossed midnight, so a time alone would be ambiguous. It's validated to be between the start minute and now.
- **todo → doing on start only when the note literally says `todo`.** A note with an unknown status displays as todo but isn't rewritten (§4.1).
- **Row time is always "tracked today / estimate"**, as §8 says. The Today/Week/All toggle drives the group totals only. Group totals include sub-folders, because collapsing a parent hides its children.
- **Minute precision:** entry times are floored to the minute. Whole intervals under 60 s, and per-day pieces that round to 0 minutes, are dropped.
- **Moving a task out of `tasksRoot`** drops it from the index but doesn't stop its timer. Only deletion stops it (§6.2). Its time then shows as "Unknown task" until the note comes back.
- **Duplicate tie-break:** when `ctime` is equal, the path sorting first wins.
- **Break session after a restart:** if the session (counted from the active timer's start) is already past the interval, one reminder fires right away. Otherwise a crossing that happened while Obsidian was closed would never be reported.
- **Tag filter UI:** selected tags show as removable chips, and a dropdown adds more. Tags match exactly, so selecting `area` doesn't match `area/work`.
- **Tag input:** spaces inside a typed tag become `-` (`two words` → `two-words`), since frontmatter tags can't contain spaces.
- **Settings:** changes to the folder settings re-index when the settings tab closes, not on every keystroke.
- **Extras:** a ribbon icon opens the task view. The spec didn't ask for it.

## Other changes

**Shared mock (`packages/obsidian-mock`).** Plugin wiring tests needed more of the API, so per AGENTS.md the mock was extended rather than adding `vi.mock` calls:
- **Vault:** folders, `createFolder`, `getFolderByPath`, `getAllLoadedFiles` and `rename`. Renaming a folder moves everything inside it and emits a rename event for the folder, then one for each moved file and folder. `obsidian.d.ts` doesn't specify this; it follows plugin developers' reports on the Obsidian forum ([#92658](https://forum.obsidian.md/t/renaming-folder-names-and-drag-and-drop-events-in-file-explorer/92658), [#76667](https://forum.obsidian.md/t/problem-with-renaming-folders-in-obsidian-plugin/76667)) and still needs checking in the dev vault (see `TESTING.md`).
- **New APIs:** `MetadataCache` (with a small YAML subset), `FileManager.processFrontMatter`/`renameFile`, `parseYaml`/`stringifyYaml`/`getFrontMatterInfo`, `WorkspaceLeaf` (`setViewState`/`getViewState`), `View`/`ItemView` (`getState`/`setState`), workspace leaf helpers (`getLeaf`, `getLeavesOfType`, `ensureSideLeaf`, `revealLeaf`, `requestSaveLayout`), `SuggestModal`/`FuzzySuggestModal`, `AbstractInputSuggest`, `setIcon`, `debounce`, `TextComponent.inputEl`, `registerView`/`registerHoverLinkSource`, `Plugin.onExternalSettingsChange`.
- **Fix:** the mock `Plugin` kept saved data in a test-only field called `data`. That field collided with a plugin's own `data` field, so every `saveData` swapped the plugin's object for a clone. It's now `savedData`.
- **DOM helpers:** `setAttr`, `setCssProps`, `appendText`.
- **Test-only extras** (not in `obsidian.d.ts`, commented as such): `Vault.readNow`, `Workspace.opened`/`viewFactories`, `Plugin.statusBarItems`/`savedData`, `openModals`.
- **Signatures** were checked against `obsidian.d.ts`, and `getAbstractFileByPath`, `getFrontMatterInfo`, `FuzzyMatch`, `rename` and `registerHoverLinkSource` were corrected to match.

**Other repo changes**
- **Extra tests:** `test/breaks.test.ts` and `test/task.test.ts` cover the pure break and task helpers. `test/plugin.test.ts` (see above) covers task creation, start → switch → stop, the midnight split, stale "Stop at…", rename and delete while running, a timer and settings synced from another device (including during an in-flight stop and with the stale dialog open), log and ancestor folder renames, duplicates, preserved log comments, view filters reacting to hand-edited tags, and view state round-tripping through `getState`/`setState`.
- **Template test:** the template's sample test (`test/main.test.ts`) was removed because it tested the template's greeting command.
- **Dev vault:** `vault/.obsidian/community-plugins.json` now enables `task-tracker`.
- **Spec location:** `SPEC.md` moved from the repo root into this folder.

## Not done yet

- The manual checklist in `TESTING.md`, in real Obsidian (desktop and a ~380 px width).
- `minAppVersion` stays at `1.8.0`. The newest API used is `workspace.ensureSideLeaf` (1.7.2).

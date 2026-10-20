# Task Tracker — Obsidian Plugin Spec

Build an Obsidian plugin for task tracking with projects, tags and time tracking. Tasks are ordinary markdown notes in a folder hierarchy. Time is recorded in daily log notes. Break reminders are a small optional extra.

Work milestone by milestone (see the end of this file). Each milestone must build cleanly and pass its acceptance criteria before you start the next. Do not change the on-disk formats defined here without asking; the user's notes depend on them.

---

## 1. Goals and non-goals

**Goals**
- Create, organize and complete tasks stored as notes under a root folder.
- Projects = folders (nesting allowed). Tags = native Obsidian frontmatter tags.
- One running timer at a time; time entries written to daily log notes.
- Totals per task, project (including sub-folders) and tag, for today / this week / all time.
- Works on desktop and mobile. Survives restarts and crashes without losing or corrupting time.
- Everything stays human-readable and editable by hand.

**Non-goals (do not build)**
- Calendar / timeboxing views, scheduling, recurring tasks.
- Issue-tracker integrations (Jira, GitHub, etc.).
- Idle detection.
- Sync logic of any kind. The vault may be synced by git or Obsidian Sync; the formats below are designed to minimize conflicts, and that is all.

---

## 2. Tech constraints

- TypeScript, started from the official `obsidian-sample-plugin` template (esbuild).
- UI in plain TypeScript using Obsidian's DOM helpers (`createEl`, `createDiv`, `setIcon`). No UI framework.
- No runtime dependencies beyond `obsidian`. Dev dependencies allowed: `vitest` for tests.
- No Node or Electron APIs anywhere. `manifest.json` → `"isDesktopOnly": false`.
- Plugin id: `task-tracker`. Name: `Task Tracker`.
- All file writes go through Obsidian APIs:
  - Frontmatter edits: `app.fileManager.processFrontMatter`.
  - Log appends and edits: `app.vault.process` (atomic read-modify-write).
  - Never rewrite a whole file from a cached copy.
- Register every listener and interval with `this.registerEvent` / `this.registerInterval` so they clean up on unload.

---

## 3. Settings

Stored via `loadData` / `saveData`, alongside runtime state (section 6).

| Key | Type | Default | Meaning |
|---|---|---|---|
| `tasksRoot` | string | `Tasks` | Root folder. Direct sub-folders are projects. |
| `logFolder` | string | `Tasks/_log` | Where daily log notes live. Excluded from the task index. |
| `defaultProject` | string | `Inbox` | Project used when creating a task without choosing one. |
| `breakRemindersEnabled` | boolean | `true` | |
| `breakIntervalMinutes` | number | `50` | |
| `maxRunningHours` | number | `12` | Threshold for the stale-timer prompt (section 6.4). |

Settings tab exposes all of them. Folder settings use a text field with folder suggestions.

---

## 4. Data model

### 4.1 Task note

Any markdown file under `tasksRoot` (excluding `logFolder`) whose frontmatter has an `id` field is a task.

```yaml
---
id: t-8f3a2c
status: todo
tags: [backend, urgent]
estimate: 90m
created: 2026-09-26
completed:
---
Free-form notes.
```

| Field | Required | Format |
|---|---|---|
| `id` | yes | `t-` + 6 lowercase hex chars, random. Must be unique in the vault. |
| `status` | yes | `todo` \| `doing` \| `done`. Unknown values are treated as `todo` for display, never rewritten. |
| `tags` | no | YAML list of strings, stored without `#`. Nested tags (`area/work`) allowed. |
| `estimate` | no | Duration string: `90m`, `1h`, `1h30m`, `1.5h`. Unparseable → ignored, shown as-is. |
| `created` | yes | `YYYY-MM-DD` |
| `completed` | no | `YYYY-MM-DD`, set when status becomes `done`, cleared when it leaves `done`. |

- **Task title** = file basename.
- **Project** = path of the parent folder relative to `tasksRoot`. For example `Work/Backend`. A task directly in `tasksRoot` has no project.
- Unknown frontmatter keys must be preserved untouched.

### 4.2 Log note

One note per local calendar day: `{logFolder}/YYYY-MM-DD.md`.

```markdown
# 2026-09-26

- 09:14–10:02 [[Fix login bug]] (t-8f3a2c)
- 10:10–10:55 [[Renew passport]] (t-1b77e0)
```

Entry line grammar (en dash `–` preferred; accept `-` when parsing):

```
- HH:MM–HH:MM [[<link text>]] (<task id>)
```

Parse regex (reference):

```
^- (\d{2}):(\d{2})[–-](\d{2}):(\d{2}) \[\[(.+?)\]\] \((t-[0-9a-f]{6})\)\s*$
```

Rules:
- The **id** is authoritative. The wikilink is for humans and may go stale after renames; never rely on it for attribution.
- Times are local. The end time must be later than the start time within the same day.
- An entry that crosses midnight is split into two entries: one in each day's note (`…–24:00` is not allowed; use `23:59` then `00:00–…`).
- Entries with a duration under 1 minute are discarded, not written.
- Lines that don't match the grammar are ignored by the parser and preserved on write. Users may add comments or headings.
- New entries are appended at the end of the file. The file is created with the `# YYYY-MM-DD` heading if missing.
- Append-only by design. The plugin never edits existing lines, except through the explicit "edit entry" flow if added later (not in scope now).

---

## 5. Indexes (in memory)

### 5.1 Task index
- Built on layout ready from `app.metadataCache` for all markdown files under `tasksRoot`, excluding `logFolder`.
- Kept current via `metadataCache.on('changed')`, `vault.on('rename')`, `vault.on('delete')`, `vault.on('create')`.
- Shape: `Map<id, { id, file, title, project, status, tags, estimate?, created, completed? }>`.
- **Duplicate ids** (for example after copying a note): keep the older file (by `ctime`) in the index. Show a Notice naming both files. Do not modify either file automatically. Provide the command "Fix duplicate task ids", which assigns fresh ids to the newer copies.

### 5.2 Time index
- Parse all notes in `logFolder` on load. Re-parse a single note on `modify`.
- Shape: entries `{ taskId, date, startMin, endMin }`, grouped by date.
- Aggregation helpers (pure functions):
  - Totals by task, by project (with and without sub-folders), and by tag.
  - Ranges: today, this week (week start is Monday), all time.
- Entries whose id is unknown are counted under "Unknown task" and still appear in totals.

---

## 6. Timer

### 6.1 State
Persisted in plugin data under `activeTimer`:

```json
{ "taskId": "t-8f3a2c", "start": "2026-09-26T09:14:00.000+02:00" }
```

or `null`. Only this is persisted. Elapsed time is always derived as `now - start`; never store a counter.

### 6.2 Behavior
- **Start on task X:** if a timer is running on another task, stop it first (writing its entry). Then set `activeTimer`. If X's status is `todo`, set it to `doing`.
- **Start on the task already running:** no-op.
- **Stop:** compute the entry or entries (midnight split), append them to the log note(s), then set `activeTimer = null`. Status stays `doing`.
- **Mark done on X:** if the timer is on X, stop it first. Set `status: done` and `completed: today`.
- **Task deleted while its timer runs:** stop the timer and write the entry (the id is still valid in the logs).
- **Task renamed or moved while running:** nothing to do. Timers track the id.

### 6.3 Status bar
- Running: `⏱ <title> · 1:23:45`, updated every second via `registerInterval`. Clicking it opens the task note.
- Idle: `⏱ No task`. Clicking it opens the task view.

### 6.4 Restart and stale timers
- On load, if `activeTimer` exists, resume showing it. Elapsed time is correct because it is derived from `start`.
- If `now - start > maxRunningHours`, open a modal: "Timer on *<title>* has been running since <start>." Offer three options:
  - **Stop now**
  - **Stop at…** (time input, must be between start and now)
  - **Keep running**
- Show this modal once per load at most.

---

## 7. Commands

| Id | Name | Behavior |
|---|---|---|
| `new-task` | New task | Modal: title, project (suggest existing project folders, allow typing a new one), tags (comma-separated), estimate. Creates `{tasksRoot}/{project}/{title}.md` with frontmatter, creating folders as needed, and opens it. If the filename exists, append ` (2)`, ` (3)`, and so on. |
| `start-timer-current` | Start timer on current note | Only available (`checkCallback`) when the active file is an indexed task. |
| `start-timer-pick` | Start timer… | Fuzzy picker over tasks that are not done. |
| `stop-timer` | Stop timer | Available only while a timer runs. |
| `toggle-done-current` | Toggle done on current note | Switches between `done` and `todo`. |
| `open-task-view` | Open task view | |
| `open-today-log` | Open today's log | Creates the note if missing. |
| `assign-missing-ids` | Convert current note to task | Adds the required frontmatter to an existing note under `tasksRoot`. |
| `fix-duplicate-ids` | Fix duplicate task ids | See 5.1. |

No default hotkeys.

---

## 8. Task view (sidebar `ItemView`)

View type: `task-tracker-view`. Opens in the right sidebar.

Layout, top to bottom:
1. **Header.** Today's tracked total and this week's total. If a timer is running, the current task with elapsed time and a stop button.
2. **Controls.** "New task" button. Status filter (All / Open / Done; default Open). Tag filter (multi-select from tags present on tasks; a task must have all selected tags). Text search on title.
3. **List.** Collapsible groups per project, sorted alphabetically; nested projects indented. Group header shows the project total for the selected range. Each task row shows:
   - A checkbox that toggles done
   - The title, which opens the note on click
   - Tag chips; clicking one adds it to the tag filter
   - Tracked-today / estimate, for example `35m / 1h30m`
   - A start/stop button
4. **Range toggle** for totals: Today / Week / All.

- Updates reactively when the indexes change. Debounce re-renders to about 200 ms. The running-timer display updates every second without re-rendering the list.
- Group collapse state and filters persist in plugin data.
- Must be usable at mobile widths: rows wrap, no horizontal scroll.

---

## 9. Break reminders

- A **session** is continuous time with any timer running. Switching tasks does not break a session. The session resets once no timer has run for 5 minutes.
- When session time reaches `breakIntervalMinutes`, and again at each further multiple of it, show `new Notice("Time for a break — you've been going for 50m", 10000)`.
- Session start is kept in memory only. After a restart the session begins at the active timer's `start`.

---

## 10. Source layout

```
src/
  main.ts            plugin lifecycle, commands, wiring
  settings.ts        defaults and settings tab
  model/
    task.ts          Task type, frontmatter read/write helpers
    duration.ts      parse/format "1h30m"          (pure)
    log.ts           log line parse/format, midnight split (pure)
    aggregate.ts     totals by task/project/tag/range    (pure)
    ids.ts           id generation                        (pure)
  index/
    taskIndex.ts
    timeIndex.ts
  timer/
    timer.ts         state machine, status bar
    breaks.ts
  ui/
    taskView.ts
    newTaskModal.ts
    staleTimerModal.ts
    taskSuggest.ts   fuzzy picker
tests/               vitest, pure modules only
```

Pure modules must not import `obsidian`, so they can be unit tested.

---

## 11. Testing

**Unit (vitest), required:**
- `duration`: `90m`, `1h`, `1h30m`, `1.5h`, bad input, formatting round-trips.
- `log`: parse valid lines, en dash and hyphen, ignore junk lines, format ↔ parse round-trip.
- Midnight split: 23:30 → 00:45 gives two entries; an entry spanning more than one full day gives three or more; entries under 1 minute are dropped.
- `aggregate`: totals by project with and without nesting, by tag (multi-tag tasks count toward each tag), week boundary on Monday, unknown ids.

**Manual checklist (write it to `TESTING.md` and run through it):**
- Create a task in a new project; the folders are created.
- Start → switch task → stop gives two correct log entries.
- Quit Obsidian with a timer running, reopen: the elapsed time is correct.
- Set the system clock ahead past `maxRunningHours`: the stale modal appears, and "Stop at…" writes the correct entry.
- Rename and move a running task: its time is still attributed correctly.
- Copy a task note: the duplicate-id Notice appears, and the fix command resolves it.
- Hand-edit a log note, adding a comment line: it is preserved and totals are unaffected.
- Mobile layout: the view is usable at about 380 px.

---

## 12. Milestones

Each milestone ends with `npm run build` passing, tests green, and a short note in `CHANGELOG.md`.

1. **Scaffold and model.** Template set up, settings, pure modules with tests.
   *Accept:* all unit tests pass; the plugin loads in a vault.
2. **Tasks.** Task index, `new-task` modal, `assign-missing-ids`, duplicate detection.
   *Accept:* created tasks have valid frontmatter and appear in the index; duplicates trigger the Notice.
3. **Timer.** Timer state machine, log writing, status bar, timer commands, stale-timer modal.
   *Accept:* the timer items in the manual checklist pass.
4. **Task view.** Sidebar view with groups, filters, totals and controls.
   *Accept:* view items in the manual checklist pass; list updates live when a note's tags are edited by hand.
5. **Break reminders and polish.** Reminders, remaining checklist items, README with usage and file formats.
   *Accept:* the full manual checklist passes.

---

## 13. Open questions (ask the user, don't guess)

- Should a task's notes body be shown in the view (for example a hover preview)? Default: no.
- Should tasks in `done` be archived or moved anywhere? Default: no. They stay in place.

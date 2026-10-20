# Task Tracker

Task tracking for Obsidian with projects, tags and time tracking. Tasks are ordinary notes, time goes into daily log notes, and everything stays readable and editable by hand. Works on desktop and mobile.

## Usage

- **Create a task:** run **New task**, or press **New task** in the task view. Pick or type a project (folders are created as needed), add comma-separated tags and an optional estimate.
- **Track time:** press ▶ on a task in the view, run **Start timer on current note**, or use **Start timer…** to pick a task. Only one timer runs at a time; starting another stops the first. Stop with ■, **Stop timer**, or by marking the task done.
- **Task view:** run **Open task view** or click the ribbon icon. Filter by status, tag (click a tag chip) or title. Switch group totals between Today, Week and All. Hover a title to preview the note.
- **Status bar:** shows the running task and elapsed time. Click it to open the task (or the view when idle).
- **Other commands:** **Toggle done on current note**, **Open today's log**, **Convert current note to task** (adds the required frontmatter to a note under the tasks folder), **Fix duplicate task ids**.
- **Long-running timers:** if a timer has run longer than the stale-timer threshold, you're asked once per launch whether to stop it now, stop it at a time you choose, or keep it running.
- **Break reminders:** after the configured interval of continuous tracking (and each multiple of it) a notice suggests a break. Switching tasks keeps the session going; 5 minutes without a timer resets it.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| Tasks folder | `Tasks` | Root folder. Its sub-folders are projects; nesting is allowed. |
| Log folder | `Tasks/_log` | Where daily log notes live. Excluded from the task list. |
| Default project | `Inbox` | Used when a new task has no project. |
| Stale timer threshold | 12 hours | When to ask about a timer that's still running. |
| Remind me to take breaks | on | |
| Break interval | 50 minutes | |

## File formats

### Task note

Any markdown file under the tasks folder (outside the log folder) with an `id` in its frontmatter.

```yaml
---
id: t-8f3a2c          # "t-" + 6 lowercase hex chars, unique in the vault
status: todo          # todo | doing | done (anything else shows as todo and is left alone)
tags: [backend, urgent]
estimate: 90m         # 90m, 1h, 1h30m, 1.5h
created: 2026-09-26
completed:            # set when status becomes done, cleared when it leaves done
---
Free-form notes.
```

- The title is the file name, and the project is the parent folder relative to the tasks folder.
- Other frontmatter keys are preserved.
- If two notes share an id (for example after copying a note), the older one counts and the copy is reported. **Fix duplicate task ids** gives the copies new ids.

### Daily log note

`{Log folder}/YYYY-MM-DD.md`, one per local day:

```markdown
# 2026-09-26

- 09:14–10:02 [[Fix login bug]] (t-8f3a2c)
- 10:10–10:55 [[Renew passport]] (t-1b77e0)
```

- The id in parentheses decides which task the time belongs to. The wikilink is for humans and may go stale after a rename.
- Times are local. Entries that cross midnight are split (`…–23:59`, then `00:00–…` in the next day's note). Entries under a minute aren't written.
- New entries are appended at the end of the file. Other lines (comments, headings) are ignored and preserved, and entries with unknown ids count as "Unknown task".

### Plugin data

`data.json` holds `settings` and the running timer as `activeTimer: { taskId, start }` (start is a local ISO timestamp). Elapsed time is always computed from `start`, so it survives restarts. When a sync tool changes `data.json`, the plugin reloads it, so a timer started on one device shows up on the others. If two devices change it at once, the last write wins.

The task view's filters and collapsed groups are view state. Obsidian saves them with the workspace layout (`workspace.json`), per device.

## Development

From the repo root: `pnpm dev task-tracker`, `pnpm test task-tracker`, `pnpm build`. See `TESTING.md` for the manual checklist.

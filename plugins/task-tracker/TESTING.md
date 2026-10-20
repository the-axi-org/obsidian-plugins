# Task Tracker: manual test checklist

Run through this in `vault/` with `pnpm dev task-tracker` (or after `pnpm build`). Enable Task Tracker under Settings → Community plugins.

Automated coverage: `test/plugin.test.ts` exercises most of these paths against the mock. This list covers what only real Obsidian can show.

## Tasks

- [ ] **New task in a new project.** Run "Task Tracker: New task", enter a title, type a project that doesn't exist (e.g. `Work/Backend`), add tags `backend, urgent` and estimate `1h30m`, then press Create. The folders `Tasks/Work/Backend/` are created, the note opens, and its frontmatter has `id: t-xxxxxx`, `status: todo`, `tags`, `estimate`, `created: <today>` and an empty `completed:`.
- [ ] Creating a task with the same title again gives `<title> (2).md`.
- [ ] **Convert a note.** Create a plain note under `Tasks/`. "Convert current note to task" adds `id`, `status` and `created` and leaves other frontmatter alone. The command is hidden on notes that are already tasks.
- [ ] **Duplicate ids.** Duplicate a task note in the file explorer. A notice names both files. The task view lists the original once. "Fix duplicate task ids" gives the copy a new id, and the copy then appears as its own task.

## Timer

- [ ] **Start → switch → stop.** Start a timer on task A (view button or "Start timer on current note"), wait a minute or two, start task B, wait, then stop. Today's log (`Tasks/_log/YYYY-MM-DD.md`) has two entries, A then B, and the B entry starts where A's ends. A `todo` task moves to `doing` when started.
- [ ] **Status bar.** While running it shows `⏱ <title> · h:mm:ss`, ticking every second, and clicking it opens the task. When idle it shows `⏱ No task`, and clicking it opens the task view.
- [ ] **Restart.** Quit Obsidian with a timer running and reopen it. The status bar's elapsed time includes the time Obsidian was closed.
- [ ] **Stale timer.** With a timer running, quit, set the system clock past `maxRunningHours` (default 12 h), and reopen. Or set the threshold low and wait. The "Timer still running" modal appears once. Use "Stop at…" with a time between the start and now: the log gets an entry ending at that time, split across days if needed. A time outside that range shows an error.
- [ ] **Rename and move.** Rename a running task and move it to another project folder, then stop. The entry carries the same id (the link text shows the new name), and the time counts toward the task's new project.
- [ ] **Delete while running.** Delete a running task's note. The timer stops and the entry is written.
- [ ] **Mark done.** Toggle done on the running task. The timer stops, `status: done` and `completed: <today>` are set, and toggling again sets `todo` and clears `completed`.
- [ ] **Hand-edited log.** Add a comment line and a heading to a log note. Both stay in place after the next entry is appended, and the totals don't change.

## Task view

- [ ] Opens in the right sidebar from the ribbon icon or "Open task view".
- [ ] The header shows today's and this week's totals. While a timer runs it shows the task, a ticking elapsed time and a stop button.
- [ ] Groups are sorted alphabetically, nested projects are indented, and collapsing a parent hides its children. Collapse state and filters survive a restart.
- [ ] The group total follows the Today / Week / All toggle and includes sub-folders.
- [ ] Each row: the checkbox toggles done; clicking the title opens the note; hovering the title shows a page preview (configurable under Settings → Page preview → Task tracker); clicking a tag chip adds it to the filter; tracked-today / estimate reads like `35m / 1h30m`; the play/stop button works.
- [ ] Status filter (All / Open / Done), tag filter (a task must have every selected tag) and title search all narrow the list.
- [ ] Editing a task's `tags:` by hand updates the list within about a second.
- [ ] **Mobile width.** At about 380 px (narrow the sidebar or use the mobile app), rows wrap and nothing scrolls horizontally.

## Break reminders

- [ ] Set the break interval to 1 minute. After a minute of tracked time a notice appears ("Time for a break — you've been going for 1m"), and again at 2m.
- [ ] Switching tasks doesn't reset the session. Stopping for more than 5 minutes does.
- [ ] Turning the toggle off stops the notices.

# Changelog

## 0.1.0 (unreleased)

Built milestone by milestone per `SPEC.md`. Each step was checked with `pnpm typecheck && pnpm lint && pnpm test`. The manual checklist in `TESTING.md` has not been run yet.

1. **Scaffold and model.** Plugin scaffolded with `pnpm new`. Settings and settings tab with folder suggestions. Pure modules for durations, log lines and the midnight split, totals by task/project/tag over today/week/all, ids, and task frontmatter helpers, all with unit tests.
2. **Tasks.** Task index from the metadata cache, kept current on change/create/rename/delete. "New task" modal with project suggestions. "Convert current note to task". Duplicate-id notice and "Fix duplicate task ids".
3. **Timer.** Single running timer persisted as `activeTimer`, with log appends through `vault.process` and per-day splitting. Status bar. Start/stop/toggle-done commands, a task picker, and "Open today's log". Stale-timer modal (stop now, stop at…, keep running).
4. **Task view.** Right-sidebar view with today/week totals, the running timer, status/tag/search filters, collapsible nested project groups with range totals, rows with done checkbox, hover preview, tag chips, tracked/estimate and start/stop. Renders are debounced and filters persist.
5. **Break reminders and polish.** Session-based break notices, README, TESTING.md.

Also extended `@op/obsidian-mock` with a metadata cache, file manager, folders, workspace leaves, views, suggesters, `debounce` and `setIcon`, following `obsidian.d.ts`.

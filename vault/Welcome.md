# Dev vault

This vault is for manually testing the plugins in `plugins/`.

- `pnpm dev <plugin-id>` builds a plugin into `.obsidian/plugins/<plugin-id>/` and rebuilds on every change.
- The **Hot Reload** plugin reloads it automatically. Install it with `pnpm vault:setup`.
- Turn a new plugin on under _Settings → Community plugins_, or add its id to `.obsidian/community-plugins.json`.

Put your test notes in this folder.

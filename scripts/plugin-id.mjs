// Shared by new-plugin and rename-plugin.

/** Returns the reason `id` breaks Obsidian's community plugin id rules, or null if it is valid. */
export function idProblem(id) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
    return "id must be lowercase letters, digits and dashes";
  if (id.includes("obsidian")) return 'id must not contain "obsidian"';
  if (id.endsWith("plugin")) return 'id must not end with "plugin"';
  return null;
}

/** "Task Tracker" -> "TaskTracker", used for the plugin's class names. */
export function toClassName(name) {
  return name
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Warns when the id or name is already in Obsidian's community plugin list.
 * Never fails: being offline only skips the check.
 */
export async function warnIfTaken(id, name) {
  const url =
    "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json";
  let list;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`${res.status}`);
    list = await res.json();
  } catch (err) {
    console.warn(`warning: couldn't check the community plugin list (${err.message})`);
    return;
  }
  const lower = name.toLowerCase();
  for (const p of list) {
    if (p.id === id) console.warn(`warning: id "${id}" is taken by ${p.repo}`);
    if (p.name?.toLowerCase() === lower)
      console.warn(`warning: name "${name}" is taken by ${p.repo}`);
  }
}

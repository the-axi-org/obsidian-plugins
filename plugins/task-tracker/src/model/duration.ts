// Duration strings used for estimates and totals: "90m", "1h", "1h30m", "1.5h".

const DURATION_RE = /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/i;

/** Minutes for a duration string, or null when it can't be parsed. */
export function parseDuration(input: string): number | null {
  const text = input.trim();
  const match = DURATION_RE.exec(text);
  if (!text || !match || (match[1] === undefined && match[2] === undefined)) return null;
  const hours = match[1] === undefined ? 0 : Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  return Math.round(hours * 60 + minutes);
}

/** "1h30m", "2h", "45m", "0m". */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** Stopwatch format for elapsed milliseconds: "0:04:05", "12:00:00". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

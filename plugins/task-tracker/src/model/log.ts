// Daily log notes: `{logFolder}/YYYY-MM-DD.md`, one entry per line:
//   - HH:MM–HH:MM [[<link text>]] (<task id>)

export interface LogEntry {
  taskId: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Minutes since local midnight. */
  startMin: number;
  endMin: number;
}

/** One entry's span within a single local day. */
export interface DaySpan {
  date: string;
  startMin: number;
  endMin: number;
}

export const LINE_RE =
  /^- (\d{2}):(\d{2})[–-](\d{2}):(\d{2}) \[\[(.+?)\]\] \((t-[0-9a-f]{6})\)\s*$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LAST_MINUTE = 23 * 60 + 59;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of `d` as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-midnight Date for a YYYY-MM-DD key. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d);
}

/** ISO 8601 in local time with the UTC offset, e.g. 2026-09-26T09:14:00.000+02:00. */
export function toLocalIso(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return (
    `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${String(d.getMilliseconds()).padStart(3, "0")}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function formatHHMM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function parseLogLine(line: string, date: string): LogEntry | null {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const [sh, sm, eh, em] = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin <= startMin) return null;
  return { taskId: m[6]!, date, startMin, endMin };
}

/** Entries in a log note. Lines that don't match the grammar are skipped. */
export function parseLog(content: string, date: string): LogEntry[] {
  return content.split(/\r?\n/).flatMap((line) => parseLogLine(line, date) ?? []);
}

export function formatLogLine(span: DaySpan, linkText: string, taskId: string): string {
  return `- ${formatHHMM(span.startMin)}–${formatHHMM(span.endMin)} [[${linkText}]] (${taskId})`;
}

export function logHeading(date: string): string {
  return `# ${date}`;
}

/** Appends `lines` at the end of a log note, adding the date heading if the note is empty. */
export function appendLogLines(content: string, date: string, lines: string[]): string {
  if (lines.length === 0) return content;
  if (content.trim() === "") return `${logHeading(date)}\n\n${lines.join("\n")}\n`;
  const sep = content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${lines.join("\n")}\n`;
}

/**
 * Splits the interval [start, end) into per-day spans at local midnight. Times are floored
 * to the minute; a day's span ends at 23:59 and the next starts at 00:00. Intervals under
 * one minute and spans that round to zero minutes are dropped.
 */
export function splitByDay(start: Date, end: Date): DaySpan[] {
  if (end.getTime() - start.getTime() < 60_000) return [];
  const spans: DaySpan[] = [];
  const endDate = dateKey(end);
  let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let startMin = start.getHours() * 60 + start.getMinutes();
  for (;;) {
    const date = dateKey(day);
    const last = date === endDate;
    const endMin = last ? end.getHours() * 60 + end.getMinutes() : LAST_MINUTE;
    if (endMin - startMin >= 1) spans.push({ date, startMin, endMin });
    if (last) return spans;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    startMin = 0;
  }
}

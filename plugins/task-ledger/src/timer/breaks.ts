// Break reminders. A session is continuous time with any timer running; switching tasks keeps
// the session going, and it resets once no timer has run for 5 minutes. In memory only.

const SESSION_GAP_MS = 5 * 60_000;

export class BreakTracker {
  private sessionStart: number | null = null;
  private lastRunning: number | null = null;
  private reminded = 0;

  /** `notify` receives the session length in minutes. */
  constructor(private notify: (minutes: number) => void) {}

  /**
   * Call about once a second. `timerStart` is the running timer's start (ms), or null when idle.
   * After a restart the session begins at the active timer's start.
   */
  tick(now: number, timerStart: number | null, intervalMinutes: number, enabled: boolean): void {
    if (timerStart === null) return;
    const gapStart = Math.min(timerStart, now);
    if (this.sessionStart === null || this.lastRunning === null || gapStart - this.lastRunning > SESSION_GAP_MS) {
      this.sessionStart = gapStart;
      this.reminded = 0;
    }
    this.lastRunning = now;

    if (!enabled || !(intervalMinutes > 0)) return;
    const intervalMs = intervalMinutes * 60_000;
    const due = Math.floor((now - this.sessionStart) / intervalMs);
    if (due > this.reminded) {
      this.reminded = due;
      this.notify(due * intervalMinutes);
    }
  }
}

import { describe, expect, it } from "vitest";
import { BreakTracker } from "../src/timer/breaks";

const MIN = 60_000;

function run(tracker: BreakTracker, from: number, to: number, timerStart: number | null) {
  for (let t = from; t <= to; t += MIN) tracker.tick(t, timerStart, 50, true);
}

describe("BreakTracker", () => {
  it("reminds at each multiple of the interval", () => {
    const shown: number[] = [];
    const tracker = new BreakTracker((m) => shown.push(m));
    run(tracker, 0, 120 * MIN, 0);
    expect(shown).toEqual([50, 100]);
  });

  it("keeps the session across task switches and short pauses", () => {
    const shown: number[] = [];
    const tracker = new BreakTracker((m) => shown.push(m));
    run(tracker, 0, 30 * MIN, 0);
    // Idle 3 minutes, then a different task starts.
    run(tracker, 33 * MIN, 55 * MIN, 33 * MIN);
    expect(shown).toEqual([50]);
  });

  it("resets after 5 minutes without a timer", () => {
    const shown: number[] = [];
    const tracker = new BreakTracker((m) => shown.push(m));
    run(tracker, 0, 45 * MIN, 0);
    run(tracker, 52 * MIN, 95 * MIN, 52 * MIN);
    expect(shown).toEqual([]);
    run(tracker, 96 * MIN, 102 * MIN, 52 * MIN);
    expect(shown).toEqual([50]);
  });

  it("starts the session at the timer's start after a restart", () => {
    const shown: number[] = [];
    const tracker = new BreakTracker((m) => shown.push(m));
    tracker.tick(55 * MIN, 0, 50, true);
    expect(shown).toEqual([50]);
  });

  it("stays quiet when disabled", () => {
    const shown: number[] = [];
    const tracker = new BreakTracker((m) => shown.push(m));
    for (let t = 0; t <= 60 * MIN; t += MIN) tracker.tick(t, 0, 50, false);
    expect(shown).toEqual([]);
  });
});

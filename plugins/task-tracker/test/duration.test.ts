import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, parseDuration } from "../src/model/duration";

describe("parseDuration", () => {
  it.each([
    ["90m", 90],
    ["1h", 60],
    ["1h30m", 90],
    ["1.5h", 90],
    ["2h 15m", 135],
    [" 45m ", 45],
    ["0m", 0],
  ])("%s → %i", (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it.each(["", "abc", "90", "1h30", "m", "h", "1.5m", "-1h", "1d"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0m"],
    [45, "45m"],
    [60, "1h"],
    [90, "1h30m"],
    [600, "10h"],
  ])("%i → %s", (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });

  it("round-trips through parseDuration", () => {
    for (const m of [0, 1, 59, 60, 61, 90, 135, 1440]) expect(parseDuration(formatDuration(m))).toBe(m);
    for (const s of ["90m", "1h", "1.5h"]) expect(formatDuration(parseDuration(s)!)).toBe(formatDuration(parseDuration(s)!));
  });
});

describe("formatClock", () => {
  it("formats elapsed time as h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00:00");
    expect(formatClock((1 * 3600 + 23 * 60 + 45) * 1000)).toBe("1:23:45");
    expect(formatClock(-5)).toBe("0:00:00");
  });
});

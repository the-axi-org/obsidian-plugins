import { describe, expect, it } from "vitest";
import {
  appendLogLines,
  dateKey,
  formatLogLine,
  parseLog,
  parseLogLine,
  splitByDay,
  toLocalIso,
} from "../src/model/log";

const D = "2026-09-26";

describe("parseLogLine", () => {
  it("parses an en-dash entry", () => {
    expect(parseLogLine("- 09:14–10:02 [[Fix login bug]] (t-8f3a2c)", D)).toEqual({
      taskId: "t-8f3a2c",
      date: D,
      startMin: 9 * 60 + 14,
      endMin: 10 * 60 + 2,
    });
  });

  it("accepts a hyphen and trailing whitespace", () => {
    expect(parseLogLine("- 10:10-10:55 [[Renew passport]] (t-1b77e0)  ", D)?.endMin).toBe(655);
  });

  it("keeps the id authoritative even when the link text is stale or odd", () => {
    expect(parseLogLine("- 08:00–08:30 [[Old name|alias]] (t-000001)", D)?.taskId).toBe("t-000001");
  });

  it.each([
    "# 2026-09-26",
    "",
    "Some comment",
    "- 09:14–10:02 [[No id]]",
    "- 09:14–10:02 [[Bad id]] (t-XYZ123)",
    "- 10:02–09:14 [[Backwards]] (t-8f3a2c)",
    "- 09:14–09:14 [[Zero]] (t-8f3a2c)",
    "- 24:00–24:30 [[Out of range]] (t-8f3a2c)",
    "- 9:14–10:02 [[Short hour]] (t-8f3a2c)",
    "  - 09:14–10:02 [[Indented]] (t-8f3a2c)",
  ])("ignores %j", (line) => {
    expect(parseLogLine(line, D)).toBeNull();
  });
});

describe("parseLog", () => {
  it("skips junk lines", () => {
    const content = [
      "# 2026-09-26",
      "",
      "- 09:14–10:02 [[Fix login bug]] (t-8f3a2c)",
      "Lunch, then:",
      "## Afternoon",
      "- 13:00-13:30 [[Renew passport]] (t-1b77e0)",
    ].join("\n");
    expect(parseLog(content, D).map((e) => e.taskId)).toEqual(["t-8f3a2c", "t-1b77e0"]);
  });
});

describe("formatLogLine", () => {
  it("round-trips with parseLogLine", () => {
    const span = { date: D, startMin: 9 * 60 + 14, endMin: 10 * 60 + 2 };
    const line = formatLogLine(span, "Fix login bug", "t-8f3a2c");
    expect(line).toBe("- 09:14–10:02 [[Fix login bug]] (t-8f3a2c)");
    expect(parseLogLine(line, D)).toEqual({ taskId: "t-8f3a2c", ...span });
  });
});

describe("appendLogLines", () => {
  it("creates the heading for an empty note", () => {
    expect(appendLogLines("", D, ["- a"])).toBe("# 2026-09-26\n\n- a\n");
  });

  it("appends at the end and preserves existing lines", () => {
    expect(appendLogLines("# 2026-09-26\n\nnote to self", D, ["- a", "- b"])).toBe(
      "# 2026-09-26\n\nnote to self\n- a\n- b\n",
    );
  });
});

describe("splitByDay", () => {
  const at = (day: number, h: number, m: number, s = 0) => new Date(2026, 8, day, h, m, s);

  it("keeps a same-day interval as one span", () => {
    expect(splitByDay(at(26, 9, 14, 30), at(26, 10, 2, 59))).toEqual([
      { date: "2026-09-26", startMin: 554, endMin: 602 },
    ]);
  });

  it("splits 23:30 → 00:45 into two entries", () => {
    expect(splitByDay(at(26, 23, 30), at(27, 0, 45))).toEqual([
      { date: "2026-09-26", startMin: 23 * 60 + 30, endMin: 23 * 60 + 59 },
      { date: "2026-09-27", startMin: 0, endMin: 45 },
    ]);
  });

  it("gives three or more entries for spans over a full day", () => {
    const spans = splitByDay(at(26, 22, 0), at(29, 1, 0));
    expect(spans.map((s) => s.date)).toEqual(["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]);
    expect(spans[1]).toEqual({ date: "2026-09-27", startMin: 0, endMin: 23 * 60 + 59 });
  });

  it("drops intervals under one minute", () => {
    expect(splitByDay(at(26, 9, 0, 0), at(26, 9, 0, 59))).toEqual([]);
    expect(splitByDay(at(26, 9, 0, 50), at(26, 9, 1, 10))).toEqual([]);
  });

  it("drops a zero-minute tail after midnight", () => {
    expect(splitByDay(at(26, 23, 0), at(27, 0, 0, 30))).toEqual([
      { date: "2026-09-26", startMin: 23 * 60, endMin: 23 * 60 + 59 },
    ]);
  });
});

describe("dates", () => {
  it("formats local dates and ISO with offset", () => {
    const d = new Date(2026, 0, 5, 7, 8, 9, 10);
    expect(dateKey(d)).toBe("2026-01-05");
    const iso = toLocalIso(d);
    expect(iso).toMatch(/^2026-01-05T07:08:09\.010[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(d.getTime());
  });
});

import { describe, expect, it } from "vitest";
import {
  filterRange,
  inRange,
  projectAncestors,
  total,
  totalsByProject,
  totalsByTag,
  totalsByTask,
  UNKNOWN_TASK,
  weekStart,
  type TaskMeta,
} from "../src/model/aggregate";
import type { LogEntry } from "../src/model/log";

const entry = (taskId: string, date: string, minutes: number): LogEntry => ({
  taskId,
  date,
  startMin: 600,
  endMin: 600 + minutes,
});

const tasks = new Map<string, TaskMeta>([
  ["t-000001", { project: "Work", tags: ["backend"] }],
  ["t-000002", { project: "Work/Backend", tags: ["backend", "urgent"] }],
  ["t-000003", { project: "Work/Backend/API", tags: [] }],
  ["t-000004", { project: "", tags: ["urgent"] }],
]);

const entries = [
  entry("t-000001", "2026-09-28", 10),
  entry("t-000002", "2026-09-28", 20),
  entry("t-000003", "2026-09-29", 30),
  entry("t-000004", "2026-09-30", 40),
  entry("t-ffffff", "2026-09-30", 5),
];

describe("totals", () => {
  it("sums by task, keeping unknown ids", () => {
    const byTask = totalsByTask(entries);
    expect(byTask.get("t-000002")).toBe(20);
    expect(byTask.get("t-ffffff")).toBe(5);
    expect(total(entries)).toBe(105);
  });

  it("sums by project without nesting", () => {
    const byProject = totalsByProject(entries, tasks, { nested: false });
    expect(Object.fromEntries(byProject)).toEqual({
      Work: 10,
      "Work/Backend": 20,
      "Work/Backend/API": 30,
      "": 40,
      [UNKNOWN_TASK]: 5,
    });
  });

  it("sums by project including sub-folders", () => {
    const byProject = totalsByProject(entries, tasks, { nested: true });
    expect(byProject.get("Work")).toBe(60);
    expect(byProject.get("Work/Backend")).toBe(50);
    expect(byProject.get("Work/Backend/API")).toBe(30);
    expect(byProject.get("")).toBe(40);
    expect(byProject.get(UNKNOWN_TASK)).toBe(5);
  });

  it("counts multi-tag tasks toward each tag", () => {
    expect(Object.fromEntries(totalsByTag(entries, tasks))).toEqual({
      backend: 30,
      urgent: 60,
      [UNKNOWN_TASK]: 5,
    });
  });

  it("lists project ancestors", () => {
    expect(projectAncestors("A/B/C")).toEqual(["A", "A/B", "A/B/C"]);
    expect(projectAncestors("")).toEqual([""]);
  });
});

describe("ranges", () => {
  // 2026-09-28 is a Monday.
  it("starts the week on Monday", () => {
    expect(weekStart(new Date(2026, 8, 28, 0, 5))).toBe("2026-09-28");
    expect(weekStart(new Date(2026, 9, 4, 23, 59))).toBe("2026-09-28"); // Sunday
    expect(weekStart(new Date(2026, 9, 5))).toBe("2026-10-05"); // next Monday
  });

  it("filters today / week / all", () => {
    const sunday = new Date(2026, 9, 4, 12);
    expect(inRange("2026-09-27", "week", sunday)).toBe(false); // previous Sunday
    expect(inRange("2026-09-28", "week", sunday)).toBe(true);
    expect(inRange("2026-10-04", "week", sunday)).toBe(true);
    expect(inRange("2026-10-05", "week", sunday)).toBe(false);

    const wed = new Date(2026, 8, 30, 9);
    expect(total(filterRange(entries, "today", wed))).toBe(45);
    expect(total(filterRange(entries, "week", wed))).toBe(105);
    expect(total(filterRange([...entries, entry("t-000001", "2026-09-27", 7)], "week", wed))).toBe(105);
    expect(total(filterRange([...entries, entry("t-000001", "2026-09-27", 7)], "all", wed))).toBe(112);
  });
});

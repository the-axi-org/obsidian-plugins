import { describe, expect, it } from "vitest";
import { generateId, isTaskId, uniqueId } from "../src/model/ids";
import {
  applyMissingTaskFields,
  applyStatus,
  availablePath,
  isTaskCandidate,
  newTaskContent,
  parseTagInput,
  projectOf,
  readTask,
  sanitizeProject,
  sanitizeTitle,
} from "../src/model/task";

describe("ids", () => {
  it("generates t- plus 6 hex chars", () => {
    expect(generateId(() => 0)).toBe("t-000000");
    expect(generateId(() => 0.999999999)).toBe("t-ffffff");
    for (let i = 0; i < 50; i++) expect(isTaskId(generateId())).toBe(true);
  });

  it("avoids taken ids", () => {
    const seq = [0, 0, 0.5];
    expect(uniqueId(new Set(["t-000000"]), () => seq.shift()!)).toBe("t-800000");
  });
});

describe("readTask", () => {
  it("reads frontmatter, title and project", () => {
    const task = readTask(
      "Tasks/Work/Backend/Fix login bug.md",
      { id: "t-8f3a2c", status: "doing", tags: ["backend", "#urgent"], estimate: "1h30m", created: "2026-09-26", completed: null },
      "Tasks",
    );
    expect(task).toMatchObject({
      id: "t-8f3a2c",
      title: "Fix login bug",
      project: "Work/Backend",
      status: "doing",
      tags: ["backend", "urgent"],
      estimate: "1h30m",
      estimateMin: 90,
      created: "2026-09-26",
    });
    expect(task?.completed).toBeUndefined();
  });

  it("treats unknown status as todo but keeps the raw value", () => {
    const task = readTask("Tasks/A.md", { id: "t-000001", status: "blocked" }, "Tasks");
    expect(task?.status).toBe("todo");
    expect(task?.rawStatus).toBe("blocked");
    expect(task?.project).toBe("");
  });

  it("keeps an unparseable estimate as written", () => {
    const task = readTask("Tasks/A.md", { id: "t-000001", estimate: "a while" }, "Tasks");
    expect(task?.estimate).toBe("a while");
    expect(task?.estimateMin).toBeNull();
  });

  it("isn't a task without a valid id", () => {
    expect(readTask("Tasks/A.md", { status: "todo" }, "Tasks")).toBeNull();
    expect(readTask("Tasks/A.md", { id: "nope" }, "Tasks")).toBeNull();
    expect(readTask("Tasks/A.md", null, "Tasks")).toBeNull();
  });
});

describe("paths", () => {
  it("only indexes markdown under the root and outside the log folder", () => {
    expect(isTaskCandidate("Tasks/A.md", "Tasks", "Tasks/_log")).toBe(true);
    expect(isTaskCandidate("Tasks/_log/2026-09-26.md", "Tasks", "Tasks/_log")).toBe(false);
    expect(isTaskCandidate("Tasksy/A.md", "Tasks", "Tasks/_log")).toBe(false);
    expect(isTaskCandidate("Tasks/A.png", "Tasks", "Tasks/_log")).toBe(false);
    expect(isTaskCandidate("A.md", "", "_log")).toBe(true);
  });

  it("derives projects relative to the root", () => {
    expect(projectOf("Tasks/Work/A.md", "Tasks/")).toBe("Work");
    expect(projectOf("Work/A.md", "")).toBe("Work");
    expect(projectOf("A.md", "")).toBe("");
  });

  it("sanitizes titles and projects", () => {
    expect(sanitizeTitle("  Fix: login/logout?  ")).toBe("Fix login logout");
    expect(sanitizeProject(" Work / Back*end/ ../")).toBe("Work/Back end");
  });

  it("numbers clashing file names", () => {
    const taken = new Set(["T/A.md", "T/A (2).md"]);
    expect(availablePath("T/A", (p) => taken.has(p))).toBe("T/A (3).md");
    expect(availablePath("T/B", (p) => taken.has(p))).toBe("T/B.md");
  });

  it("parses comma-separated tags", () => {
    expect(parseTagInput("backend, #urgent,, area/work , two words")).toEqual([
      "backend",
      "urgent",
      "area/work",
      "two-words",
    ]);
  });
});

describe("frontmatter writes", () => {
  it("sets and clears completed with status", () => {
    const fm: Record<string, unknown> = { id: "t-000001", status: "todo", custom: 1 };
    applyStatus(fm, "done", "2026-09-26");
    expect(fm).toEqual({ id: "t-000001", status: "done", completed: "2026-09-26", custom: 1 });
    applyStatus(fm, "todo", "2026-09-27");
    expect(fm).toEqual({ id: "t-000001", status: "todo", completed: null, custom: 1 });
  });

  it("fills only missing fields", () => {
    const fm: Record<string, unknown> = { status: "blocked", tags: ["x"] };
    applyMissingTaskFields(fm, "t-abcdef", "2026-09-26");
    expect(fm).toEqual({ status: "blocked", tags: ["x"], id: "t-abcdef", created: "2026-09-26" });
  });

  it("writes new-task frontmatter that reads back", () => {
    const content = newTaskContent({ id: "t-8f3a2c", tags: ["backend", "a b"], estimate: "90m", created: "2026-09-26" });
    expect(content).toBe(
      ["---", "id: t-8f3a2c", "status: todo", 'tags: [backend, "a b"]', "estimate: 90m", "created: 2026-09-26", "completed:", "---", ""].join("\n"),
    );
  });
});

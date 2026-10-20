// Task ids: "t-" + 6 random lowercase hex chars.

export const ID_RE = /^t-[0-9a-f]{6}$/;

export function isTaskId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

/** `random` returns a float in [0, 1), like Math.random; injectable for tests. */
export function generateId(random: () => number = Math.random): string {
  const n = Math.floor(random() * 0x1000000);
  return `t-${n.toString(16).padStart(6, "0")}`;
}

/** A fresh id not present in `taken`. */
export function uniqueId(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  for (;;) {
    const id = generateId(random);
    if (!taken.has(id)) return id;
  }
}

import { describe, expect, it } from "vitest";

import { formatUtcTimestamp, parseUtcTimestamp } from "../src/index.js";

describe("time", () => {
  it("formats UTC timestamps with milliseconds", () => {
    const ms = Date.UTC(2026, 8, 24, 10, 0, 5, 4);

    expect(formatUtcTimestamp(ms)).toBe("20260924-10:00:05.004");
    expect(parseUtcTimestamp("20260924-10:00:05.004")).toBe(ms);
    expect(parseUtcTimestamp("20260924-10:00:05")).toBe(ms - 4);
    expect(() => parseUtcTimestamp("2026-09-24 10:00")).toThrow();
  });
});

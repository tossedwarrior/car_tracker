import { describe, expect, it } from "vitest";
import { isDue, localDate, pagesPerWatch, runsLeftInMonth } from "./budget";

const oct = (day: number) => new Date(2026, 9, day, 7);

describe("runsLeftInMonth", () => {
  it("counts today and the rest of the month for a daily source", () => {
    expect(runsLeftInMonth(1, oct(1))).toBe(31);
    expect(runsLeftInMonth(1, oct(22))).toBe(10);
    expect(runsLeftInMonth(1, oct(31))).toBe(1);
  });

  it("counts only due days for an every-3-days source", () => {
    const due = Array.from({ length: 10 }, (_, i) => oct(22 + i)).filter((d) => isDue(3, d)).length;
    expect(runsLeftInMonth(3, oct(22))).toBe(due);
    expect(due).toBeGreaterThanOrEqual(3);
    expect(due).toBeLessThanOrEqual(4);
  });
});

describe("pagesPerWatch", () => {
  it("spreads the month's remaining calls over runs and cars", () => {
    // 999 left over 10 days = 99 a run; 8 cars → 12 each, capped at 5.
    expect(pagesPerWatch({ limit: 1000, used: 1, watchCount: 8, everyDays: 1, now: oct(22) })).toBe(5);
    // Start of month: 1000 / 31 = 32 a run; 8 cars → 4 each.
    expect(pagesPerWatch({ limit: 1000, used: 0, watchCount: 8, everyDays: 1, now: oct(1) })).toBe(4);
  });

  it("always allows at least one page so new listings are caught", () => {
    expect(pagesPerWatch({ limit: 1000, used: 990, watchCount: 8, everyDays: 1, now: oct(22) })).toBe(1);
    expect(pagesPerWatch({ limit: 1000, used: 1000, watchCount: 8, everyDays: 1, now: oct(22) })).toBe(1);
  });
});

describe("localDate", () => {
  it("uses the local calendar day", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

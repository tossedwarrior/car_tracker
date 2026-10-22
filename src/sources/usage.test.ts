import { describe, expect, it } from "vitest";
import { BudgetExceededError, getUsage, reserveCall } from "./usage";

describe("reserveCall", () => {
  it("counts calls per source per month and stops at the limit", () => {
    reserveCall("test-a", 2, "2026-10");
    reserveCall("test-a", 2, "2026-10");
    expect(getUsage("test-a", "2026-10")).toBe(2);
    expect(() => reserveCall("test-a", 2, "2026-10")).toThrow(BudgetExceededError);
    expect(getUsage("test-a", "2026-10")).toBe(2);

    // A new month and a different source each start from zero.
    reserveCall("test-a", 2, "2026-11");
    reserveCall("test-b", 2, "2026-10");
    expect(getUsage("test-a", "2026-11")).toBe(1);
    expect(getUsage("test-b", "2026-10")).toBe(1);
  });
});

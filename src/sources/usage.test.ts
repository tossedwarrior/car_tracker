import { describe, expect, it } from "vitest";
import { BudgetExceededError, getUsage, reserveCall } from "./usage";

describe("reserveCall", () => {
  it("counts calls per source per month and stops at the limit", async () => {
    await reserveCall("test-a", 2, "2026-10");
    await reserveCall("test-a", 2, "2026-10");
    expect(await getUsage("test-a", "2026-10")).toBe(2);
    await expect(reserveCall("test-a", 2, "2026-10")).rejects.toThrow(BudgetExceededError);
    expect(await getUsage("test-a", "2026-10")).toBe(2);

    // A new month and a different source each start from zero.
    await reserveCall("test-a", 2, "2026-11");
    await reserveCall("test-b", 2, "2026-10");
    expect(await getUsage("test-a", "2026-11")).toBe(1);
    expect(await getUsage("test-b", "2026-10")).toBe(1);
  });
});

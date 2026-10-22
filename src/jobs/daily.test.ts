import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { checkRuns, listings, watchlist } from "@/db/schema";
import { autodev } from "@/sources/autodev";
import { BudgetExceededError, type ListingSource } from "@/sources/types";
import { fixtureContext } from "@/test/fixtures";
import { runDailyCheck } from "./daily";

const now = new Date(2026, 9, 22, 7);

describe("runDailyCheck", () => {
  it("searches every active watched car, saves listings and logs the run", async () => {
    const w = db
      .insert(watchlist)
      .values({ make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015, maxKm: 40000 })
      .returning()
      .get();
    db.insert(watchlist).values({ make: "Ferrari", model: "F40", yearMin: 1987, yearMax: 1992, active: false }).run();

    const ctx = fixtureContext([
      { fixture: "autodev/search-page1.json" },
      { fixture: "autodev/search-page2.json" },
    ]);
    const result = await runDailyCheck({ now, sources: [autodev], contextFor: () => ctx });

    expect(result.status).toBe("ok");
    expect(result.calls).toBe(2);
    expect(ctx.urls).toHaveLength(2); // the inactive F40 isn't searched
    expect(db.select().from(listings).where(eq(listings.watchId, w.id)).all()).toHaveLength(22);
    expect(result.log.join("\n")).toContain("Ferrari 458 Italia: 22 found, source reported 23, 22 new, 2 call(s).");

    const run = db.select().from(checkRuns).where(eq(checkRuns.id, result.runId)).get()!;
    expect(run.status).toBe("ok");
    expect(run.finishedAt).toBeTruthy();
    expect(run.log).toContain("22 new");
  });

  it("skips a source with no API key and keeps going", async () => {
    const noKey: ListingSource = {
      ...autodev,
      id: "nokey",
      label: "No Key",
    };
    const result = await runDailyCheck({
      now,
      sources: [noKey],
      contextFor: () => {
        throw new Error("NOKEY_API_KEY is not set in .env");
      },
    });
    expect(result.status).toBe("failed");
    expect(result.log[0]).toBe("No Key: skipped, NOKEY_API_KEY is not set in .env.");
  });

  it("stops a source when it runs out of free calls", async () => {
    const ctx = fixtureContext([]);
    ctx.beforeCall = () => {
      throw new BudgetExceededError("autodev", 1000, 1000);
    };
    const result = await runDailyCheck({ now, sources: [autodev], contextFor: () => ctx });
    expect(result.status).toBe("failed");
    expect(result.log.join("\n")).toContain("stopped, autodev has used 1000 of 1000 free calls this month.");
  });

  it("skips sources that aren't due today", async () => {
    const every3: ListingSource = { ...autodev, id: "slow", label: "Slow", everyDays: 3 };
    const notDue = [0, 1, 2].map((i) => new Date(2026, 9, 22 + i, 7)).find((d) =>
      Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000) % 3 !== 0,
    )!;
    const result = await runDailyCheck({ now: notDue, sources: [every3], contextFor: () => fixtureContext([]) });
    expect(result.log.join("\n")).toContain("Slow: not due today (runs every 3 days).");
  });
});

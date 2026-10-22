import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { checkRuns, listings, watchlist } from "@/db/schema";
import { autodev } from "@/sources/autodev";
import { BudgetExceededError, type ListingSource } from "@/sources/types";
import { fixtureContext } from "@/test/fixtures";
import { pagesPerWatch } from "./budget";
import { runRefresh } from "./refresh";

const now = new Date(2026, 9, 22, 7);
const addWatch = (values: Partial<typeof watchlist.$inferInsert> = {}) =>
  db
    .insert(watchlist)
    .values({ make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015, ...values })
    .returning()
    .get();

describe("runRefresh", () => {
  it("refreshes only the watched car asked for, and logs the run", async () => {
    const w = addWatch({ maxKm: 40000 });
    const other = addWatch({ model: "F12berlinetta" });

    const ctx = fixtureContext([
      { fixture: "autodev/search-page1.json" },
      { fixture: "autodev/search-page2.json" },
    ]);
    const result = await runRefresh({ watchIds: [w.id], now, sources: [autodev], contextFor: () => ctx });

    expect(result.status).toBe("ok");
    expect(result.calls).toBe(2);
    expect(ctx.urls).toHaveLength(2);
    expect(db.select().from(listings).where(eq(listings.watchId, w.id)).all()).toHaveLength(22);
    expect(result.log.join("\n")).toContain(
      "Ferrari 458 Italia: 22 found, source reported 23, 22 new, 2 call(s).",
    );

    const watches = db.select().from(watchlist).all();
    expect(watches.find((x) => x.id === w.id)!.lastRefreshed).toBeTruthy();
    expect(watches.find((x) => x.id === other.id)!.lastRefreshed).toBeNull();

    const run = db.select().from(checkRuns).where(eq(checkRuns.id, result.runId)).get()!;
    expect(run).toMatchObject({ status: "ok" });
    expect(run.log).toContain("22 new");
  });

  it("skips inactive watched cars", async () => {
    const inactive = addWatch({ model: "F40", yearMin: 1987, yearMax: 1992, active: false });
    const result = await runRefresh({
      watchIds: [inactive.id],
      now,
      sources: [autodev],
      contextFor: () => fixtureContext([]),
    });
    expect(result.log).toEqual(["No active watched cars."]);
    expect(result.calls).toBe(0);
  });

  it("skips a source with no API key and reports the refresh as failed", async () => {
    const w = addWatch();
    const noKey: ListingSource = { ...autodev, id: "nokey", label: "No Key" };
    const result = await runRefresh({
      watchIds: [w.id],
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
    const w = addWatch();
    const ctx = fixtureContext([]);
    ctx.beforeCall = () => {
      throw new BudgetExceededError("autodev", 1000, 1000);
    };
    const result = await runRefresh({ watchIds: [w.id], now, sources: [autodev], contextFor: () => ctx });
    expect(result.status).toBe("failed");
    expect(result.log.join("\n")).toContain("stopped, autodev has used 1000 of 1000 free calls this month.");
  });
});

describe("pagesPerWatch", () => {
  it("gives each car the full 5 pages while calls are plentiful", () => {
    expect(pagesPerWatch({ limit: 1000, used: 6, watchCount: 8 })).toBe(5);
  });

  it("shares the last few calls so every car gets its newest listings", () => {
    expect(pagesPerWatch({ limit: 1000, used: 976, watchCount: 8 })).toBe(3);
    expect(pagesPerWatch({ limit: 1000, used: 995, watchCount: 8 })).toBe(1);
    expect(pagesPerWatch({ limit: 1000, used: 1000, watchCount: 8 })).toBe(1);
  });
});

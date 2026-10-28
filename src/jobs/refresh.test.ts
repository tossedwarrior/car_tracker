import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { insertRow } from "@/test/db";
import { checkRuns, listings, watchlist } from "@/db/schema";
import { autodev } from "@/sources/autodev";
import { BudgetExceededError, type ListingSource } from "@/sources/types";
import { fixtureContext } from "@/test/fixtures";
import { callsPerWatch } from "./budget";
import { runRefresh } from "./refresh";

const now = new Date(2026, 9, 22, 7);
const syncFx = async () => 0;
const addWatch = async (values: Partial<typeof watchlist.$inferInsert> = {}) =>
  (await insertRow(watchlist, { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015, ...values }));

describe("runRefresh", () => {
  it("refreshes only the watched car asked for, and logs the run", async () => {
    const w = await addWatch({ maxKm: 40000 });
    const other = await addWatch({ model: "F12berlinetta" });

    const ctx = fixtureContext([
      { fixture: "autodev/search-page1.json" },
      { fixture: "autodev/search-page2.json" },
    ]);
    const result = await runRefresh({ watchIds: [w.id], now, sources: [autodev], contextFor: () => ctx, syncFx });

    expect(result.status).toBe("ok");
    expect(result.calls).toBe(2);
    expect(ctx.urls).toHaveLength(2);
    expect((await db.select().from(listings).where(eq(listings.watchId, w.id)))).toHaveLength(22);
    expect(result.log.join("\n")).toContain(
      "Ferrari 458 Italia: 22 found, source reported 23, 22 new, 2 call(s).",
    );

    const watches = (await db.select().from(watchlist));
    expect(watches.find((x) => x.id === w.id)!.lastRefreshed).toBeTruthy();
    expect(watches.find((x) => x.id === other.id)!.lastRefreshed).toBeNull();

    const run = (await db.select().from(checkRuns).where(eq(checkRuns.id, result.runId)).limit(1))[0]!;
    expect(run).toMatchObject({ status: "ok" });
    expect(run.log).toContain("22 new");
  });

  it("skips inactive watched cars", async () => {
    const inactive = await addWatch({ model: "F40", yearMin: 1987, yearMax: 1992, active: false });
    const result = await runRefresh({
      watchIds: [inactive.id],
      now,
      sources: [autodev],
      contextFor: () => fixtureContext([]),
      syncFx,
    });
    expect(result.log).toEqual(["No active watched cars."]);
    expect(result.calls).toBe(0);
  });

  it("skips a source with no API key; with no other source, nothing ran", async () => {
    const w = await addWatch();
    const noKey: ListingSource = { ...autodev, id: "nokey", label: "No Key" };
    const result = await runRefresh({
      watchIds: [w.id],
      now,
      sources: [noKey],
      contextFor: () => {
        throw new Error("NOKEY_API_KEY is not set in .env");
      },
      syncFx,
    });
    expect(result.status).toBe("failed");
    expect(result.log[0]).toBe("No Key: skipped, NOKEY_API_KEY is not set in .env.");
  });

  it("stops a source when it runs out of free calls", async () => {
    const w = await addWatch();
    const ctx = fixtureContext([]);
    ctx.beforeCall = () => {
      throw new BudgetExceededError("autodev", 1000, 1000);
    };
    const result = await runRefresh({ watchIds: [w.id], now, sources: [autodev], contextFor: () => ctx, syncFx });
    expect(result.status).toBe("failed");
    expect(result.log.join("\n")).toContain("stopped, autodev has used 1000 of 1000 free calls this month.");
  });
});

describe("callsPerWatch", () => {
  const autodevCalls = { min: 1, max: 5, limit: 1000, watchCount: 8 };
  const marketcheckCalls = { min: 4, max: 6, limit: 500, watchCount: 8 };

  it("gives each car the most calls while plenty are left", async () => {
    expect(callsPerWatch({ ...autodevCalls, used: 6 })).toBe(5);
    expect(callsPerWatch({ ...marketcheckCalls, used: 0 })).toBe(6);
  });

  it("shares the last calls so every car still gets the minimum", async () => {
    expect(callsPerWatch({ ...autodevCalls, used: 976 })).toBe(3);
    expect(callsPerWatch({ ...autodevCalls, used: 1000 })).toBe(1);
    expect(callsPerWatch({ ...marketcheckCalls, used: 470 })).toBe(4);
  });
});

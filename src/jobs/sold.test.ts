import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { insertRow } from "@/test/db";
import { soldResults, watchlist } from "@/db/schema";
import { oldcarsdata } from "@/sources/oldcarsdata";
import { fixtureContext } from "@/test/fixtures";
import { getSoldResults, median, pullSoldResults, sameModel } from "./sold";

const ctx = () =>
  fixtureContext([
    { fixture: "oldcarsdata/live-models-ferrari.json" },
    { fixture: "oldcarsdata/auctions-458.json" },
  ]);

describe("pullSoldResults", () => {
  it("saves new auction results once and records when it pulled", async () => {
    const w = (await insertRow(watchlist, { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015 }));
    const now = new Date("2026-10-22T16:00:00Z");

    const first = await pullSoldResults(w.id, { sources: [oldcarsdata], contextFor: ctx, now });
    const again = await pullSoldResults(w.id, { sources: [oldcarsdata], contextFor: ctx, now });

    expect(first).toEqual({ found: 3, added: 3, calls: 1, matchedModel: "458" });
    expect(again).toMatchObject({ found: 3, added: 0 });
    expect((await db.select().from(soldResults))).toHaveLength(3);
    expect((await db.select().from(watchlist).where(eq(watchlist.id, w.id)).limit(1))[0]?.lastSoldPull).toBe(
      "2026-10-22T16:00:00.000Z",
    );

    // "458 Italia" finds results saved under Old Cars Data's "458", newest first.
    const rows = await getSoldResults(w);
    expect(rows.map((r) => r.soldDate)).toEqual(["2026-09-14", "2026-08-30", "2026-05-02"]);
    expect(await getSoldResults({ ...w, yearMin: 2015, yearMax: 2015 })).toHaveLength(1);
    expect(await getSoldResults({ ...w, model: "488 GTB" })).toHaveLength(0);
  });
});

describe("sameModel", () => {
  it("matches whole words only", async () => {
    expect(sameModel("458 Italia", "458")).toBe(true);
    expect(sameModel("458", "458 Spider")).toBe(true);
    expect(sameModel("4588", "458")).toBe(false);
    expect(sameModel("458", null)).toBe(false);
  });
});

describe("median", () => {
  it("handles odd, even and empty lists", async () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3);
    expect(median([])).toBeNull();
  });
});

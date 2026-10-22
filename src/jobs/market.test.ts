import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { listings, marketSnapshots, soldResults, watchlist } from "@/db/schema";
import { Rates } from "@/lib/fx";
import { getMarketHistory, takeMarketSnapshot, trendOf, weekStart } from "./market";

const rates = new Rates([{ date: "2026-01-01", base: "USD", rate: 1.4 }]);

const addWatch = (model: string) =>
  db.insert(watchlist).values({ make: "Ferrari", model, yearMin: 2011, yearMax: 2015 }).returning().get();

const addListing = (watchId: number, n: number, over: Partial<typeof listings.$inferInsert> = {}) =>
  db
    .insert(listings)
    .values({
      watchId,
      source: "autodev",
      sourceListingId: `${watchId}-${n}`,
      currency: "USD",
      firstSeen: "2026-10-01",
      lastSeen: "2026-10-22",
      ...over,
    })
    .run();

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart(new Date(2026, 9, 22))).toBe("2026-10-19"); // Thursday
    expect(weekStart(new Date(2026, 9, 19))).toBe("2026-10-19"); // Monday
    expect(weekStart(new Date(2026, 9, 25))).toBe("2026-10-19"); // Sunday
  });
});

describe("trendOf", () => {
  const series = (start: number, end: number) => [
    { date: "2026-06-01", value: start },
    { date: "2026-07-15", value: (start + end) / 2 },
    { date: "2026-09-07", value: end },
  ];

  it("is rising above +3% over 3 months, cooling below -3%, flat between", () => {
    expect(trendOf(series(100, 104))).toEqual({ label: "rising", change: expect.closeTo(0.04) });
    expect(trendOf(series(100, 96))).toEqual({ label: "cooling", change: expect.closeTo(-0.04) });
    expect(trendOf(series(100, 102.9))?.label).toBe("flat");
  });

  it("needs a point at least 3 months before the latest", () => {
    expect(trendOf([{ date: "2026-08-01", value: 1 }, { date: "2026-09-07", value: 2 }])).toBeNull();
    expect(trendOf([])).toBeNull();
  });
});

describe("takeMarketSnapshot", () => {
  it("saves this week's medians in CAD and replaces them on a later refresh", () => {
    const w = addWatch("458 Italia");
    addListing(w.id, 1, { price: 200000, listedAt: "2026-10-12T00:00:00Z" }); // 280,000 CAD
    addListing(w.id, 2, { price: 300000, currency: "CAD", listedAt: "2026-10-02T00:00:00Z" });
    addListing(w.id, 3, { price: null, firstSeen: "2026-10-22" });
    addListing(w.id, 4, { price: 1, status: "gone" });
    db.insert(soldResults)
      .values([
        { source: "t", sourceResultId: "a", title: "x", make: "Ferrari", model: "458", year: 2013, price: 250000, currency: "USD", soldDate: "2026-09-01" },
        { source: "t", sourceResultId: "b", title: "x", make: "Ferrari", model: "458", year: 2013, price: 1, currency: "USD", soldDate: "2026-01-01" }, // too old
      ])
      .run();

    takeMarketSnapshot(w.id, rates, new Date(2026, 9, 22, 12));
    const snap = () => db.select().from(marketSnapshots).where(eq(marketSnapshots.watchId, w.id)).all();
    expect(snap()).toEqual([
      expect.objectContaining({
        week: "2026-10-19",
        medianAsk: 290000,
        medianSold: 350000,
        listingCount: 3,
        medianDaysListed: 10,
        currency: "CAD",
      }),
    ]);

    addListing(w.id, 5, { price: 400000, currency: "CAD" });
    takeMarketSnapshot(w.id, rates, new Date(2026, 9, 23, 12));
    expect(snap()).toHaveLength(1);
    expect(snap()[0]).toMatchObject({ listingCount: 4, medianAsk: 300000 });
  });
});

describe("getMarketHistory", () => {
  it("charts weekly asks and monthly sales, and says when there isn't enough history", () => {
    const w = addWatch("F12berlinetta");
    db.insert(marketSnapshots)
      .values([
        { watchId: w.id, week: "2026-10-12", medianAsk: 300000, listingCount: 5, medianDaysListed: 20, currency: "CAD" },
        { watchId: w.id, week: "2026-10-19", medianAsk: 310000, listingCount: 6, medianDaysListed: null, currency: "CAD" },
      ])
      .run();
    db.insert(soldResults)
      .values([
        { source: "t", sourceResultId: "f1", title: "x", make: "Ferrari", model: "F12berlinetta", year: 2014, price: 200000, currency: "USD", soldDate: "2026-09-03" },
        { source: "t", sourceResultId: "f2", title: "x", make: "Ferrari", model: "F12berlinetta", year: 2014, price: 220000, currency: "USD", soldDate: "2026-09-20" },
        { source: "t", sourceResultId: "f3", title: "x", make: "Ferrari", model: "F12berlinetta", year: 2014, price: 230000, currency: "USD", soldDate: "2026-10-02" },
      ])
      .run();

    const h = getMarketHistory(w, rates, new Date(2026, 9, 22));
    expect(h.ask.map((p) => p.value)).toEqual([300000, 310000]);
    expect(h.listed.map((p) => p.value)).toEqual([5, 6]);
    expect(h.daysListed).toHaveLength(1);
    expect(h.sold).toEqual([
      { date: "2026-09-15", value: 294000, count: 2 },
      { date: "2026-10-15", value: 322000, count: 1 },
    ]);
    expect(h.sales.map((p) => [p.date, p.value, p.price, p.currency])).toEqual([
      ["2026-09-03", 280000, 200000, "USD"],
      ["2026-09-20", 308000, 220000, "USD"],
      ["2026-10-02", 322000, 230000, "USD"],
    ]);
    expect(h.trend).toMatchObject({ label: null, basis: null });
    expect(h.trend.reason).toContain("3 months");
  });

  it("falls back to auction sales for the label until asking history reaches 3 months", () => {
    const w = addWatch("California T");
    db.insert(soldResults)
      .values([
        { source: "t", sourceResultId: "c1", title: "x", make: "Ferrari", model: "California T", year: 2015, price: 100000, currency: "CAD", soldDate: "2026-05-10" },
        { source: "t", sourceResultId: "c2", title: "x", make: "Ferrari", model: "California T", year: 2015, price: 95000, currency: "CAD", soldDate: "2026-09-10" },
      ])
      .run();
    const h = getMarketHistory(w, rates, new Date(2026, 9, 22));
    expect(h.trend).toMatchObject({ label: "cooling", basis: "sold" });
  });
});

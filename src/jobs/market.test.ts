import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { insertRow } from "@/test/db";
import { listings, marketSnapshots, priceSnapshots, soldResults, watchlist } from "@/db/schema";
import { Rates } from "@/lib/fx";
import { getMarketDetails, getMarketHistory, takeMarketSnapshot, trendOf, weekStart } from "./market";

const rates = new Rates([{ date: "2026-01-01", base: "USD", rate: 1.4 }]);

const addWatch = async (model: string) =>
  (await insertRow(watchlist, { make: "Ferrari", model, yearMin: 2011, yearMax: 2015 }));

const addListing = async (watchId: number, n: number, over: Partial<typeof listings.$inferInsert> = {}) =>
  await db
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
    ;

describe("weekStart", () => {
  it("returns the Monday of the week", async () => {
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

  it("is rising above +3% over 3 months, cooling below -3%, flat between", async () => {
    expect(trendOf(series(100, 104))).toEqual({ label: "rising", change: expect.closeTo(0.04) });
    expect(trendOf(series(100, 96))).toEqual({ label: "cooling", change: expect.closeTo(-0.04) });
    expect(trendOf(series(100, 102.9))?.label).toBe("flat");
  });

  it("needs a point at least 3 months before the latest", async () => {
    expect(trendOf([{ date: "2026-08-01", value: 1 }, { date: "2026-09-07", value: 2 }])).toBeNull();
    expect(trendOf([])).toBeNull();
  });
});

describe("takeMarketSnapshot", () => {
  it("saves this week's medians in CAD and replaces them on a later refresh", async () => {
    const w = await addWatch("458 Italia");
    await addListing(w.id, 1, { price: 200000, listedAt: "2026-10-12T00:00:00Z" }); // 280,000 CAD
    await addListing(w.id, 2, { price: 300000, currency: "CAD", listedAt: "2026-10-02T00:00:00Z" });
    await addListing(w.id, 3, { price: null, firstSeen: "2026-10-22" });
    await addListing(w.id, 4, { price: 1, status: "gone" });
    await db.insert(soldResults)
      .values([
        { source: "t", sourceResultId: "a", title: "x", make: "Ferrari", model: "458", year: 2013, price: 250000, currency: "USD", soldDate: "2026-09-01" },
        { source: "t", sourceResultId: "b", title: "x", make: "Ferrari", model: "458", year: 2013, price: 1, currency: "USD", soldDate: "2026-01-01" }, // too old
      ])
      ;

    await takeMarketSnapshot(w.id, rates, new Date(2026, 9, 22, 12));
    const snap = async () => (await db.select().from(marketSnapshots).where(eq(marketSnapshots.watchId, w.id)));
    expect(await snap()).toEqual([
      expect.objectContaining({
        week: "2026-10-19",
        medianAsk: 290000,
        medianSold: 350000,
        listingCount: 3,
        medianDaysListed: 10,
        currency: "CAD",
      }),
    ]);

    await addListing(w.id, 5, { price: 400000, currency: "CAD" });
    await takeMarketSnapshot(w.id, rates, new Date(2026, 9, 23, 12));
    expect(await snap()).toHaveLength(1);
    expect((await snap())[0]).toMatchObject({ listingCount: 4, medianAsk: 300000 });
  });
});

describe("getMarketHistory", () => {
  it("charts weekly asks and monthly sales, and says when there isn't enough history", async () => {
    const w = await addWatch("F12berlinetta");
    await db.insert(marketSnapshots)
      .values([
        { watchId: w.id, week: "2026-10-12", medianAsk: 300000, listingCount: 5, medianDaysListed: 20, currency: "CAD" },
        { watchId: w.id, week: "2026-10-19", medianAsk: 310000, listingCount: 6, medianDaysListed: null, currency: "CAD" },
      ])
      ;
    await db.insert(soldResults)
      .values([
        { source: "t", sourceResultId: "f1", title: "x", make: "Ferrari", model: "F12berlinetta", year: 2014, price: 200000, currency: "USD", soldDate: "2026-09-03" },
        { source: "t", sourceResultId: "f2", title: "x", make: "Ferrari", model: "F12berlinetta", year: 2014, price: 220000, currency: "USD", soldDate: "2026-09-20" },
        { source: "t", sourceResultId: "f3", title: "x", make: "Ferrari", model: "F12berlinetta", year: 2014, price: 230000, currency: "USD", soldDate: "2026-10-02" },
      ])
      ;

    const h = await getMarketHistory(w, rates, new Date(2026, 9, 22));
    expect(h.ask.map((p) => p.value)).toEqual([300000, 310000]);
    expect(h.listed.map((p) => p.value)).toEqual([5, 6]);
    expect(h.daysListed).toHaveLength(1);
    // Two September sales: CA$280,000 and CA$308,000.
    expect(h.sold).toEqual([
      { date: "2026-09-15", value: 294000, count: 2, low: 287000, high: 301000 },
      { date: "2026-10-15", value: 322000, count: 1, low: 322000, high: 322000 },
    ]);
    expect(h.sales.map((p) => [p.date, p.value, p.price, p.currency])).toEqual([
      ["2026-09-03", 280000, 200000, "USD"],
      ["2026-09-20", 308000, 220000, "USD"],
      ["2026-10-02", 322000, 230000, "USD"],
    ]);
    expect(h.trend).toMatchObject({ label: null, basis: null });
    expect(h.trend.reason).toContain("3 months");
  });

  it("falls back to auction sales for the label until asking history reaches 3 months", async () => {
    const w = await addWatch("California T");
    await db.insert(soldResults)
      .values([
        { source: "t", sourceResultId: "c1", title: "x", make: "Ferrari", model: "California T", year: 2015, price: 100000, currency: "CAD", soldDate: "2026-05-10" },
        { source: "t", sourceResultId: "c2", title: "x", make: "Ferrari", model: "California T", year: 2015, price: 95000, currency: "CAD", soldDate: "2026-09-10" },
      ])
      ;
    const h = await getMarketHistory(w, rates, new Date(2026, 9, 22));
    expect(h.trend).toMatchObject({ label: "cooling", basis: "sold" });
  });
});

describe("variants and details", () => {
  // Each test gets its own model, so their sample data doesn't mix.
  let model = "";
  const sale = (id: string, title: string, year: number, price: number, soldDate: string) => ({
    source: "t",
    sourceResultId: `${model}-${id}`,
    title,
    make: "Ferrari",
    model,
    year,
    price,
    currency: "CAD",
    soldDate,
  });

  async function setup(name: string) {
    model = name;
    const w = await addWatch(name);
    await db.insert(soldResults)
      .values([
        sale("v1", "2016 Ferrari 488 GTB", 2016, 300000, "2026-10-01"),
        sale("v2", "2017 Ferrari 488 GTB", 2017, 320000, "2026-09-20"),
        sale("v3", "2017 Ferrari 488 Spider", 2017, 360000, "2026-09-10"),
        sale("v4", "2019 Ferrari 488 Pista", 2019, 700000, "2026-08-01"),
        sale("v5", "2016 Ferrari 488 GTB", 2016, 280000, "2026-06-01"), // prior 3 months
        sale("v6", "2016 Ferrari 488 GTB", 2016, 290000, "2026-05-15"), // prior 3 months
      ])
      ;
    await addListing(w.id, 1, { title: "2016 Ferrari 488 GTB", year: 2016, price: 250000, km: 20000 }); // CA$350k
    await addListing(w.id, 2, { title: "2017 Ferrari 488 Spider", trim: "Spider", year: 2017, price: 400000, currency: "CAD", km: 10000 });
    await addListing(w.id, 3, { title: "2019 Ferrari 488 Pista", year: 2019, price: null });
    return w;
  }

  it("filters the history to one variant and gives each month its price spread", async () => {
    const w = await setup("488");
    const all = await getMarketHistory({ ...w, yearMin: 2015, yearMax: 2019 }, rates, new Date(2026, 9, 22));
    expect(all.sales.map((s) => s.variant)).toEqual(["Standard", "Standard", "Pista", "Spider", "Standard", "Standard"]);
    const sep = all.sold.find((m) => m.date === "2026-09-15")!;
    expect(sep).toMatchObject({ count: 2, value: 340000, low: 330000, high: 350000 });

    const standard = await getMarketHistory({ ...w, yearMin: 2015, yearMax: 2019 }, rates, new Date(2026, 9, 22), {
      variant: "Standard",
    });
    expect(standard.sales).toHaveLength(4);
    expect(standard.ask).toEqual([]); // weekly asking isn't kept per variant
  });

  it("compares variants and years, and measures momentum and the asking gap", async () => {
    const w = { ...(await setup("F8 Tributo")), yearMin: 2015, yearMax: 2019 };
    const d = await getMarketDetails(w, rates, new Date(2026, 9, 22));
    expect(d.variants.map((v) => [v.variant, v.listed, v.sales, v.medianAsk, v.medianSold])).toEqual([
      ["Standard", 1, 4, 350000, 295000],
      ["Spider", 1, 1, 400000, 360000],
      ["Pista", 1, 1, null, 700000],
    ]);
    expect(d.variants[1].gap).toBeCloseTo(400000 / 360000 - 1);

    const standard = await getMarketDetails(w, rates, new Date(2026, 9, 22), { variant: "Standard" });
    expect(standard.years.find((y) => y.year === 2016)).toEqual({
      year: 2016, listed: 1, medianAsk: 350000, medianKm: 20000, sales: 3, medianSold: 290000,
    });
    expect(standard.years.map((y) => y.year)).toEqual([2015, 2016, 2017, 2018, 2019]);
    // Last 3 months: 300k, 320k → 310k. The 3 before: 280k, 290k → 285k.
    expect(standard.momentum).toMatchObject({ recent: 310000, recentCount: 2, prior: 285000, priorCount: 2 });
    expect(standard.momentum.change).toBeCloseTo(310 / 285 - 1);
    expect(standard.askVsSold).toMatchObject({ ask: 350000, sold: 310000 });
  });

  it("counts price cuts on current listings in the last 30 days", async () => {
    const w = await addWatch("Portofino");
    await addListing(w.id, 1, { price: 200000 });
    await addListing(w.id, 2, { price: 300000 });
    const [a, b] = (await db.select().from(listings).where(eq(listings.watchId, w.id)));
    await db.insert(priceSnapshots)
      .values([
        { listingId: a.id, date: "2026-09-01", price: 220000, currency: "USD" },
        { listingId: a.id, date: "2026-10-10", price: 200000, currency: "USD" }, // cut 9.1%
        { listingId: b.id, date: "2026-08-01", price: 330000, currency: "USD" },
        { listingId: b.id, date: "2026-09-01", price: 300000, currency: "USD" }, // cut, but too long ago
      ])
      ;
    const d = await getMarketDetails({ ...w, yearMin: 2011, yearMax: 2015 }, rates, new Date(2026, 9, 22));
    expect(d.priceCuts.cut).toBe(1);
    expect(d.priceCuts.of).toBe(2);
    expect(d.priceCuts.medianCut).toBeCloseTo(0.0909, 3);
  });
});

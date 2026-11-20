import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { alertsSent, follows, listings, watchlist } from "@/db/schema";
import { insertRow, makeUser } from "@/test/db";
import { Rates } from "./fx";
import {
  addCar,
  countFollowers,
  getWatch,
  listWatches,
  parseWatchForm,
  sortByPrice,
  unfollow,
  updateCar,
  type WatchInput,
} from "./watchlist";

const now = new Date("2026-10-22");
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("parseWatchForm", () => {
  it("accepts the spec's example and strips commas and $", () => {
    const result = parseWatchForm(
      form({ make: " Ferrari ", model: "458 Italia", yearMin: "2011", yearMax: "2015", maxKm: "40,000", targetPrice: "$250,000", targetCurrency: "CAD", trim: "" }),
      now,
    );
    expect(result).toEqual({
      ok: true,
      values: {
        make: "Ferrari",
        model: "458 Italia",
        yearMin: 2011,
        yearMax: 2015,
        maxKm: 40000,
        trim: null,
        targetPrice: 250000,
        targetCurrency: "CAD",
        notes: null,
      },
    });
  });

  it("uses the first year as the last when only one is given", () => {
    const result = parseWatchForm(form({ make: "Aston Martin", model: "DB11", yearMin: "2019" }), now);
    expect(result.ok && [result.values.yearMin, result.values.yearMax]).toEqual([2019, 2019]);
  });

  it("reports each bad field", () => {
    const result = parseWatchForm(
      form({ make: "", model: "", yearMin: "2015", yearMax: "2011", maxKm: "lots", targetPrice: "0", targetCurrency: "EUR" }),
      now,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(
      ["make", "maxKm", "model", "targetCurrency", "targetPrice", "yearMax"].sort(),
    );
  });

  it("rejects years outside 1950 to next year", () => {
    const result = parseWatchForm(form({ make: "Ferrari", model: "F40", yearMin: "1949", yearMax: "2028" }), now);
    expect(!result.ok && result.errors.yearMin).toBeTruthy();
  });
});

describe("sortByPrice", () => {
  const rates = new Rates([{ date: "2026-01-01", base: "USD", rate: 1.4 }]);
  const rows = [
    { id: "CA$300k", price: 300000, currency: "CAD" },
    { id: "no price", price: null, currency: "CAD" },
    { id: "US$200k = CA$280k", price: 200000, currency: "USD" },
    { id: "CA$290k", price: 290000, currency: "CAD" },
  ];

  it("compares CAD and USD prices converted, with no-price listings last both ways", () => {
    expect(sortByPrice(rows, rates, "asc").map((r) => r.id)).toEqual([
      "US$200k = CA$280k",
      "CA$290k",
      "CA$300k",
      "no price",
    ]);
    expect(sortByPrice(rows, rates, "desc").map((r) => r.id)).toEqual([
      "CA$300k",
      "CA$290k",
      "US$200k = CA$280k",
      "no price",
    ]);
  });
});

const car = (overrides: Partial<WatchInput> = {}): WatchInput => ({
  make: "Ferrari",
  model: "458 Italia",
  yearMin: 2011,
  yearMax: 2015,
  maxKm: 40000,
  trim: null,
  targetPrice: null,
  targetCurrency: "CAD",
  notes: null,
  ...overrides,
});
const added = async (result: Awaited<ReturnType<typeof addCar>>) => {
  if ("error" in result) throw new Error(result.error);
  return result.watchId;
};

describe("following cars", () => {
  it("shares one search between people who add the same car, each with their own target", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const first = await added(await addCar(a, car({ targetPrice: 250000 })));
    const second = await added(await addCar(b, car({ make: "ferrari", model: "458 ITALIA", targetPrice: 200000, notes: "Red" })));

    expect(second).toBe(first);
    expect(await countFollowers(first)).toBe(2);
    expect(await getWatch(a.id, first)).toMatchObject({ targetPrice: 250000, notes: null });
    expect(await getWatch(b.id, first)).toMatchObject({ targetPrice: 200000, notes: "Red" });
    // A different mileage limit is a different search.
    expect(await added(await addCar(b, car({ maxKm: 20000 })))).not.toBe(first);
  });

  it("only shows people their own cars", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const id = await added(await addCar(a, car()));
    expect(await getWatch(b.id, id)).toBeUndefined();
    expect((await listWatches(a.id)).map((w) => w.id)).toEqual([id]);
    expect(await listWatches(b.id)).toEqual([]);
  });

  it("stops at the per-person limit, except for the owner", async () => {
    vi.stubEnv("MAX_CARS_PER_USER", "2");
    const person = await makeUser();
    const owner = await makeUser({ isAdmin: true });
    await added(await addCar(person, car({ yearMin: 2011, yearMax: 2011 })));
    await added(await addCar(person, car({ yearMin: 2012, yearMax: 2012 })));
    expect(await addCar(person, car({ yearMin: 2013, yearMax: 2013 }))).toEqual({
      error: "You can follow up to 2 cars. Remove one to add another.",
    });
    // Re-adding one they follow is just an update.
    expect(await addCar(person, car({ yearMin: 2011, yearMax: 2011, targetPrice: 1 }))).toHaveProperty("watchId");
    for (const year of [2011, 2012, 2013]) await added(await addCar(owner, car({ yearMin: year, yearMax: year })));
    vi.unstubAllEnvs();
  });

  it("edits a search in place for its only follower, and moves someone off a shared one", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const solo = await added(await addCar(a, car({ model: "F8" })));
    expect(await updateCar(a, solo, car({ model: "F8 Tributo", targetPrice: 300000 }))).toBe(solo);
    expect((await db.select().from(watchlist).where(eq(watchlist.id, solo)))[0].model).toBe("F8 Tributo");

    const shared = await added(await addCar(a, car({ model: "812" })));
    await addCar(b, car({ model: "812" }));
    const moved = await updateCar(b, shared, car({ model: "812", maxKm: 10000 }));
    expect(moved).not.toBe(shared);
    expect((await db.select().from(watchlist).where(eq(watchlist.id, shared)))[0].maxKm).toBe(40000);
    expect(await getWatch(b.id, shared)).toBeUndefined();
    expect(await getWatch(b.id, moved)).toMatchObject({ maxKm: 10000 });
  });

  it("removes someone's alerts with the car, and deletes a car nobody follows", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const id = await added(await addCar(a, car({ model: "Roma" })));
    await addCar(b, car({ model: "Roma" }));
    const listing = await insertRow(listings, {
      watchId: id,
      source: "autodev",
      sourceListingId: "X",
      currency: "USD",
      firstSeen: "2026-11-01",
      lastSeen: "2026-11-01",
    });
    await db.insert(alertsSent).values([
      { userId: a.id, listingId: listing.id, type: "new_listing", date: "2026-11-01" },
      { userId: b.id, listingId: listing.id, type: "new_listing", date: "2026-11-01" },
    ]);

    await unfollow(a.id, id);
    const alertsLeft = await db.select().from(alertsSent).where(eq(alertsSent.listingId, listing.id));
    expect(alertsLeft.map((r) => r.userId)).toEqual([b.id]);
    expect(await countFollowers(id)).toBe(1);

    await unfollow(b.id, id);
    expect(await db.select().from(watchlist).where(eq(watchlist.id, id))).toEqual([]);
    expect(await db.select().from(follows).where(eq(follows.watchId, id))).toEqual([]);
  });
});

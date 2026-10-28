import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { insertRow } from "@/test/db";
import { listings, priceSnapshots, watchlist } from "@/db/schema";
import type { NormalizedListing } from "@/sources/types";
import { recordListings } from "./ingest";

let watchId: number;
beforeEach(async () => {
  watchId = (await insertRow(watchlist, { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015 })).id;
});

const car = (n: number, over: Partial<NormalizedListing> = {}): NormalizedListing => ({
  source: "autodev",
  sourceListingId: `VIN${n}`,
  vin: `VIN${n}`,
  title: `Car ${n}`,
  make: "Ferrari",
  model: "458 Italia",
  year: 2013,
  trim: null,
  km: 10000,
  price: 300000 + n,
  currency: "USD",
  sellerType: "dealer",
  sellerName: "Sample Exotics",
  location: "Miami, FL",
  country: "US",
  url: `https://dealer.example.com/${n}`,
  listedAt: null,
  ...over,
});

const record = async (date: string, found: NormalizedListing[], complete = true, source = "autodev") =>
  await recordListings({ watchId, source, found, date, complete });

const rows = async () => (await db.select().from(listings).where(eq(listings.watchId, watchId)));
const row = async (vin: string) => (await rows()).find((r) => r.vin === vin)!;
const snapshots = async (listingId: number) =>
  (await db.select().from(priceSnapshots).where(eq(priceSnapshots.listingId, listingId)));

describe("recordListings", () => {
  it("adds new cars with a first price snapshot", async () => {
    const stats = await record("2026-10-01", [car(1), car(2, { price: null })]);
    expect(stats.added).toBe(2);
    expect(await row("VIN1")).toMatchObject({ firstSeen: "2026-10-01", lastSeen: "2026-10-01", status: "active" });
    expect(await snapshots((await row("VIN1")).id)).toHaveLength(1);
    expect(await snapshots((await row("VIN2")).id)).toHaveLength(0);
  });

  it("saves a snapshot only when the price changes", async () => {
    await record("2026-10-01", [car(1, { price: 300000 })]);
    expect((await record("2026-10-02", [car(1, { price: 300000 })])).priceDrops).toBe(0);
    const drop = await record("2026-10-03", [car(1, { price: 289000, km: 10100 })]);
    const rise = await record("2026-10-04", [car(1, { price: 295000 })]);

    expect(drop.priceDrops).toBe(1);
    expect(rise.priceRises).toBe(1);
    expect((await snapshots((await row("VIN1")).id)).map((s) => [s.date, s.price])).toEqual([
      ["2026-10-01", 300000],
      ["2026-10-03", 289000],
      ["2026-10-04", 295000],
    ]);
    expect(await row("VIN1")).toMatchObject({ price: 295000, km: 10000, firstSeen: "2026-10-01", lastSeen: "2026-10-04" });
  });

  it("keeps the last known price when a source stops showing one", async () => {
    await record("2026-10-01", [car(1, { price: 300000 })]);
    await record("2026-10-02", [car(1, { price: null })]);
    expect((await row("VIN1")).price).toBe(300000);
    expect(await snapshots((await row("VIN1")).id)).toHaveLength(1);
  });

  it("marks a car gone after missing from refreshes on 3 different days", async () => {
    await record("2026-10-01", [car(1), car(2)]);
    expect((await record("2026-10-02", [car(1)])).missed).toBe(1);
    expect((await record("2026-10-03", [car(1)])).missed).toBe(1);
    expect(await row("VIN2")).toMatchObject({ missedChecks: 2, status: "active" });

    const stats = await record("2026-10-04", [car(1)]);
    expect(stats.gone).toBe(1);
    expect(await row("VIN2")).toMatchObject({ missedChecks: 3, status: "gone" });
    expect(await rows()).toHaveLength(2); // never deleted
  });

  it("resets the miss count when the car shows up again", async () => {
    await record("2026-10-01", [car(1), car(2)]);
    await record("2026-10-02", [car(1)]);
    await record("2026-10-03", [car(1), car(2)]);
    expect(await row("VIN2")).toMatchObject({ missedChecks: 0, status: "active" });
  });

  it("brings a gone car back when it's listed again", async () => {
    await record("2026-10-01", [car(1), car(2)]);
    for (const d of ["2026-10-02", "2026-10-03", "2026-10-04"]) await record(d, [car(1)]);
    expect((await row("VIN2")).status).toBe("gone");
    expect((await record("2026-10-05", [car(2)])).returned).toBe(1);
    expect(await row("VIN2")).toMatchObject({ status: "active", missedChecks: 0 });
  });

  it("counts at most one miss per day, however often it refreshes", async () => {
    await record("2026-10-01", [car(1), car(2)]);
    await record("2026-10-02", [car(1)]);
    await record("2026-10-02", [car(1)]);
    expect((await row("VIN2")).missedChecks).toBe(1);
  });

  it("doesn't count misses when not every page was fetched", async () => {
    await record("2026-10-01", [car(1), car(2)]);
    const stats = await record("2026-10-02", [car(1)], false);
    expect(stats.missed).toBe(0);
    expect((await row("VIN2")).missedChecks).toBe(0);
  });

  it("matches the same car from another source by VIN", async () => {
    await record("2026-10-01", [car(1), car(2)]);
    const stats = await record(
      "2026-10-02",
      [car(1, { source: "marketcheck", sourceListingId: "mc-abc", price: 410000, currency: "CAD" })],
      true,
      "marketcheck",
    );
    expect(stats).toMatchObject({ added: 0, matchedByVin: 1 });
    expect(await rows()).toHaveLength(2);
    // The original source's details stay; the car just counts as seen.
    expect(await row("VIN1")).toMatchObject({ source: "autodev", currency: "USD", lastSeen: "2026-10-02" });
    // A complete search by one source doesn't count misses for another's cars.
    expect((await row("VIN2")).missedChecks).toBe(0);
  });

  it("matches by source and listing ID when there's no VIN", async () => {
    const noVin = car(9, { vin: null, sourceListingId: "ad-9" });
    await record("2026-10-01", [noVin]);
    expect((await record("2026-10-02", [{ ...noVin, price: 1 }])).priceDrops).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  it("keeps listings separate per watched car", async () => {
    await record("2026-10-01", [car(1)]);
    const otherWatch = (await insertRow(watchlist, { make: "Ferrari", model: "458 Italia", yearMin: 2013, yearMax: 2013 })).id;
    await recordListings({ watchId: otherWatch, source: "autodev", found: [car(1)], date: "2026-10-01", complete: true });
    const both = (await db.select().from(listings).where(eq(listings.vin, "VIN1")))
      .filter((r) => r.watchId === watchId || r.watchId === otherWatch);
    expect(both).toHaveLength(2);
  });
});

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { listings, priceSnapshots, watchlist } from "@/db/schema";
import type { NormalizedListing } from "@/sources/types";
import { recordListings } from "./ingest";

let watchId: number;
beforeEach(() => {
  watchId = db
    .insert(watchlist)
    .values({ make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015 })
    .returning()
    .get().id;
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

const record = (date: string, found: NormalizedListing[], complete = true, source = "autodev") =>
  recordListings({ watchId, source, found, date, complete });

const rows = () => db.select().from(listings).where(eq(listings.watchId, watchId)).all();
const row = (vin: string) => rows().find((r) => r.vin === vin)!;
const snapshots = (listingId: number) =>
  db.select().from(priceSnapshots).where(eq(priceSnapshots.listingId, listingId)).all();

describe("recordListings", () => {
  it("adds new cars with a first price snapshot", () => {
    const stats = record("2026-10-01", [car(1), car(2, { price: null })]);
    expect(stats.added).toBe(2);
    expect(row("VIN1")).toMatchObject({ firstSeen: "2026-10-01", lastSeen: "2026-10-01", status: "active" });
    expect(snapshots(row("VIN1").id)).toHaveLength(1);
    expect(snapshots(row("VIN2").id)).toHaveLength(0);
  });

  it("saves a snapshot only when the price changes", () => {
    record("2026-10-01", [car(1, { price: 300000 })]);
    expect(record("2026-10-02", [car(1, { price: 300000 })]).priceDrops).toBe(0);
    const drop = record("2026-10-03", [car(1, { price: 289000, km: 10100 })]);
    const rise = record("2026-10-04", [car(1, { price: 295000 })]);

    expect(drop.priceDrops).toBe(1);
    expect(rise.priceRises).toBe(1);
    expect(snapshots(row("VIN1").id).map((s) => [s.date, s.price])).toEqual([
      ["2026-10-01", 300000],
      ["2026-10-03", 289000],
      ["2026-10-04", 295000],
    ]);
    expect(row("VIN1")).toMatchObject({ price: 295000, km: 10000, firstSeen: "2026-10-01", lastSeen: "2026-10-04" });
  });

  it("keeps the last known price when a source stops showing one", () => {
    record("2026-10-01", [car(1, { price: 300000 })]);
    record("2026-10-02", [car(1, { price: null })]);
    expect(row("VIN1").price).toBe(300000);
    expect(snapshots(row("VIN1").id)).toHaveLength(1);
  });

  it("marks a car gone after 3 daily checks in a row without it", () => {
    record("2026-10-01", [car(1), car(2)]);
    expect(record("2026-10-02", [car(1)]).missed).toBe(1);
    expect(record("2026-10-03", [car(1)]).missed).toBe(1);
    expect(row("VIN2")).toMatchObject({ missedChecks: 2, status: "active" });

    const stats = record("2026-10-04", [car(1)]);
    expect(stats.gone).toBe(1);
    expect(row("VIN2")).toMatchObject({ missedChecks: 3, status: "gone" });
    expect(rows()).toHaveLength(2); // never deleted
  });

  it("resets the miss count when the car shows up again", () => {
    record("2026-10-01", [car(1), car(2)]);
    record("2026-10-02", [car(1)]);
    record("2026-10-03", [car(1), car(2)]);
    expect(row("VIN2")).toMatchObject({ missedChecks: 0, status: "active" });
  });

  it("brings a gone car back when it's listed again", () => {
    record("2026-10-01", [car(1), car(2)]);
    for (const d of ["2026-10-02", "2026-10-03", "2026-10-04"]) record(d, [car(1)]);
    expect(row("VIN2").status).toBe("gone");
    expect(record("2026-10-05", [car(2)]).returned).toBe(1);
    expect(row("VIN2")).toMatchObject({ status: "active", missedChecks: 0 });
  });

  it("counts at most one miss per day if the check runs twice", () => {
    record("2026-10-01", [car(1), car(2)]);
    record("2026-10-02", [car(1)]);
    record("2026-10-02", [car(1)]);
    expect(row("VIN2").missedChecks).toBe(1);
  });

  it("doesn't count misses when not every page was fetched", () => {
    record("2026-10-01", [car(1), car(2)]);
    const stats = record("2026-10-02", [car(1)], false);
    expect(stats.missed).toBe(0);
    expect(row("VIN2").missedChecks).toBe(0);
  });

  it("matches the same car from another source by VIN", () => {
    record("2026-10-01", [car(1), car(2)]);
    const stats = record(
      "2026-10-02",
      [car(1, { source: "marketcheck", sourceListingId: "mc-abc", price: 410000, currency: "CAD" })],
      true,
      "marketcheck",
    );
    expect(stats).toMatchObject({ added: 0, matchedByVin: 1 });
    expect(rows()).toHaveLength(2);
    // The original source's details stay; the car just counts as seen.
    expect(row("VIN1")).toMatchObject({ source: "autodev", currency: "USD", lastSeen: "2026-10-02" });
    // A complete search by one source doesn't count misses for another's cars.
    expect(row("VIN2").missedChecks).toBe(0);
  });

  it("matches by source and listing ID when there's no VIN", () => {
    const noVin = car(9, { vin: null, sourceListingId: "ad-9" });
    record("2026-10-01", [noVin]);
    expect(record("2026-10-02", [{ ...noVin, price: 1 }]).priceDrops).toBe(1);
    expect(rows()).toHaveLength(1);
  });

  it("keeps listings separate per watched car", () => {
    record("2026-10-01", [car(1)]);
    const otherWatch = db
      .insert(watchlist)
      .values({ make: "Ferrari", model: "458 Italia", yearMin: 2013, yearMax: 2013 })
      .returning()
      .get().id;
    recordListings({ watchId: otherWatch, source: "autodev", found: [car(1)], date: "2026-10-01", complete: true });
    const both = db.select().from(listings).where(eq(listings.vin, "VIN1")).all()
      .filter((r) => r.watchId === watchId || r.watchId === otherWatch);
    expect(both).toHaveLength(2);
  });
});

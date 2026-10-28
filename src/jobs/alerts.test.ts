import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { insertRow } from "@/test/db";
import { watchlist } from "@/db/schema";
import { Rates } from "@/lib/fx";
import type { NormalizedListing } from "@/sources/types";
import { countUnseenAlerts, getAlerts, markAllAlertsSeen, recordAlerts } from "./alerts";
import { recordListings } from "./ingest";

const rates = new Rates([{ date: "2026-01-01", base: "USD", rate: 1.4 }]);

const car = (vin: string, price: number | null, currency: "USD" | "CAD" = "USD"): NormalizedListing => ({
  source: "autodev",
  sourceListingId: vin,
  vin,
  title: vin,
  make: "Ferrari",
  model: "458 Italia",
  year: 2013,
  trim: null,
  km: 10000,
  price,
  currency,
  sellerType: "dealer",
  sellerName: null,
  location: null,
  country: "US",
  url: null,
  listedAt: null,
});

async function setup(targetPrice: number | null = 250000) {
  const watchId = (await insertRow(watchlist, { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015, targetPrice, targetCurrency: "CAD" })).id;
  const refresh = async (date: string, found: NormalizedListing[], firstSearch = false) => {
    const { addedIds } = await recordListings({ watchId, source: "autodev", found, date, complete: true });
    return await recordAlerts({ watchId, source: "autodev", date, rates, newListingIds: addedIds, firstSearch });
  };
  return { watchId, refresh };
}

describe("recordAlerts", () => {
  it("doesn't call every car new on a source's first search", async () => {
    const { refresh } = await setup(null);
    expect(await refresh("2026-10-01", [car("A1", 300000), car("A2", 310000)], true)).toEqual({
      new_listing: 0,
      price_drop: 0,
      under_target: 0,
    });
    expect(await refresh("2026-10-02", [car("A1", 300000), car("A2", 310000), car("A3", 320000)])).toMatchObject({
      new_listing: 1,
    });
  });

  it("only calls a car new in the refresh that added it, even later the same day", async () => {
    const { refresh } = await setup(null);
    await refresh("2026-10-01", [car("N1", 300000)], true);
    expect((await refresh("2026-10-01", [car("N1", 300000), car("N2", 1)])).new_listing).toBe(1);
    expect((await refresh("2026-10-01", [car("N1", 300000), car("N2", 1)])).new_listing).toBe(0);
  });

  it("alerts on each price drop, once per new price", async () => {
    const { refresh } = await setup(null);
    await refresh("2026-10-01", [car("B1", 300000)], true);
    expect((await refresh("2026-10-02", [car("B1", 290000)])).price_drop).toBe(1);
    expect((await refresh("2026-10-02", [car("B1", 290000)])).price_drop).toBe(0); // same day again
    expect((await refresh("2026-10-03", [car("B1", 295000)])).price_drop).toBe(0); // a rise
    expect((await refresh("2026-10-04", [car("B1", 280000)])).price_drop).toBe(1);
  });

  it("alerts once when a car is under target, comparing across currencies", async () => {
    // Target CA$250,000. US$178,000 = CA$249,200 at 1.40.
    const { refresh } = await setup(250000);
    const first = await refresh("2026-10-01", [car("C1", 178000), car("C2", 179000), car("C3", 240000, "CAD")], true);
    expect(first.under_target).toBe(2);
    expect(await refresh("2026-10-02", [car("C1", 170000), car("C2", 179000), car("C3", 240000, "CAD")])).toEqual({
      new_listing: 0,
      price_drop: 1,
      under_target: 0,
    });
  });

  it("lists alerts newest first with the price before a drop, and tracks what's been seen", async () => {
    const { refresh } = await setup(null);
    await refresh("2026-10-01", [car("D1", 300000)], true);
    await refresh("2026-10-05", [car("D1", 275000)]);

    const drop = (await getAlerts()).find((a) => a.listing.vin === "D1")!;
    expect(drop).toMatchObject({ type: "price_drop", price: 275000, previousPrice: 300000, seen: false });
    expect(await countUnseenAlerts()).toBeGreaterThan(0);
    await markAllAlertsSeen();
    expect(await countUnseenAlerts()).toBe(0);
  });
});

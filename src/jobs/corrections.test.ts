import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { insertRow } from "@/test/db";
import { alertsSent, listings, priceSnapshots, watchlist } from "@/db/schema";
import { Rates } from "@/lib/fx";
import type { NormalizedListing } from "@/sources/types";
import { recordAlerts } from "./alerts";
import { correctListing } from "./corrections";
import { recordListings } from "./ingest";

const rates = new Rates([{ date: "2026-01-01", base: "USD", rate: 1.4 }]);

// The real case: a Quebec dealer group's Florida branch, priced in USD,
// reported by MarketCheck as a Canadian (CAD) listing in Victoriaville, QC.
const hgregoire = (price = 239000): NormalizedListing => ({
  source: "marketcheck",
  sourceListingId: "ZFF67NFA5D0194485-bedb07e6-cdf2",
  vin: "ZFF67NFA5D0194485",
  title: "2013 Ferrari 458 Italia",
  make: "Ferrari",
  model: "458 Italia",
  year: 2013,
  trim: null,
  km: 29128,
  price,
  currency: "CAD",
  sellerType: "dealer",
  sellerName: "Hgregoire",
  location: "Victoriaville, QC",
  country: "CA",
  url: "https://www.hgregoire.com/used-car/ferrari-458-italia-2013-for-sale-14465049",
  listedAt: null,
});

describe("correctListing", () => {
  it("fixes the currency and location, drops a wrong under-target alert, and survives refreshes", async () => {
    const watchId = (await insertRow(watchlist, { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015, targetPrice: 250000, targetCurrency: "CAD" })).id;
    const refresh = async (date: string, price?: number) => {
      const { addedIds } = await recordListings({ watchId, source: "marketcheck", found: [hgregoire(price)], date, complete: true });
      return await recordAlerts({ watchId, source: "marketcheck", date, rates, newListingIds: addedIds, firstSearch: false });
    };

    // CA$239,000 looks under the CA$250,000 target...
    expect((await refresh("2026-10-22")).under_target).toBe(1);
    const id = (await db.select().from(listings).where(eq(listings.watchId, watchId)).limit(1))[0]!.id;

    // ...but it's US$239,000 (CA$334,600) in West Palm Beach.
    await correctListing(id, { currency: "USD", location: "West Palm Beach, FL" }, rates, new Date(2026, 9, 22));
    const row = async () => (await db.select().from(listings).where(eq(listings.id, id)).limit(1))[0]!;
    expect(await row()).toMatchObject({ currency: "USD", location: "West Palm Beach, FL", currencyOverride: "USD" });
    expect((await db.select().from(alertsSent).where(eq(alertsSent.listingId, id))).map((a) => a.type)).toEqual([
      "new_listing",
    ]);
    expect((await db.select().from(priceSnapshots).where(eq(priceSnapshots.listingId, id)).limit(1))[0]?.currency).toBe("USD");

    // The next refresh still reports CAD and Victoriaville; the correction holds.
    await refresh("2026-10-23", 229000);
    expect(await row()).toMatchObject({ currency: "USD", location: "West Palm Beach, FL", price: 229000 });
    expect(
      (await db.select().from(priceSnapshots).where(eq(priceSnapshots.listingId, id))).map((s) => s.currency),
    ).toEqual(["USD", "USD"]);

    // Clearing the correction hands it back to the source on the next refresh.
    await correctListing(id, { currency: null, location: null }, rates);
    await refresh("2026-10-24", 229000);
    expect(await row()).toMatchObject({ currency: "CAD", location: "Victoriaville, QC", currencyOverride: null });
  });
});

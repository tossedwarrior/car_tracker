import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { follows } from "@/db/schema";
import { followedWatch, makeUser } from "@/test/db";
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
  const { userId, watchId } = await followedWatch({ targetPrice });
  const refresh = async (date: string, found: NormalizedListing[], firstSearch = false) => {
    const { addedIds } = await recordListings({ watchId, source: "autodev", found, date, complete: true });
    return await recordAlerts({ watchId, source: "autodev", date, rates, newListingIds: addedIds, firstSearch });
  };
  return { userId, watchId, refresh };
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
    const { userId, refresh } = await setup(null);
    await refresh("2026-10-01", [car("D1", 300000)], true);
    await refresh("2026-10-05", [car("D1", 275000)]);

    const drop = (await getAlerts(userId)).find((a) => a.listing.vin === "D1")!;
    expect(drop).toMatchObject({ type: "price_drop", price: 275000, previousPrice: 300000, seen: false });
    expect(await countUnseenAlerts(userId)).toBeGreaterThan(0);
    await markAllAlertsSeen(userId);
    expect(await countUnseenAlerts(userId)).toBe(0);
  });

  it("alerts each follower, under their own target, and keeps their alerts apart", async () => {
    // Target CA$250,000 for the first follower; the second's is US$150,000.
    const { userId: first, watchId, refresh } = await setup(250000);
    const second = (await makeUser()).id;
    await db.insert(follows).values({ userId: second, watchId, targetPrice: 150000, targetCurrency: "USD" });
    await refresh("2026-10-01", [car("E1", 300000)], true);

    const counts = await refresh("2026-10-02", [car("E1", 300000), car("E2", 170000)]);
    // E2 is new to both, but counted once; it's US$170,000: under the first target, over the second.
    expect(counts).toMatchObject({ new_listing: 1, under_target: 1 });
    const types = async (userId: number) => (await getAlerts(userId)).map((a) => a.type).sort();
    expect(await types(first)).toEqual(["new_listing", "under_target"]);
    expect(await types(second)).toEqual(["new_listing"]);

    await markAllAlertsSeen(first);
    expect(await countUnseenAlerts(first)).toBe(0);
    expect(await countUnseenAlerts(second)).toBe(1);
  });

  it("records nothing for a car nobody follows", async () => {
    const { userId, watchId, refresh } = await setup(250000);
    await db.delete(follows).where(eq(follows.watchId, watchId));
    await refresh("2026-10-01", [car("F1", 1)], true);
    expect(await refresh("2026-10-02", [car("F1", 1), car("F2", 1)])).toEqual({
      new_listing: 0,
      price_drop: 0,
      under_target: 0,
    });
    expect(await getAlerts(userId)).toEqual([]);
  });
});

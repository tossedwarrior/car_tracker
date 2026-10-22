import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alertsSent, listings, priceSnapshots, watchlist, type Currency } from "@/db/schema";
import type { Rates } from "@/lib/fx";
import { isUnderTarget } from "@/lib/money";
import { takeMarketSnapshot } from "./market";

/**
 * Correct a listing's price currency and/or location when the source got
 * them wrong. Refreshes keep the correction. Pass null to go back to what
 * the source says (applied on the next refresh).
 *
 * Also re-labels its price history, drops an "under target" alert that no
 * longer holds, and retakes this week's market snapshot.
 */
export function correctListing(
  listingId: number,
  { currency, location }: { currency: Currency | null; location: string | null },
  rates: Rates,
  now = new Date(),
) {
  const listing = db.select().from(listings).where(eq(listings.id, listingId)).get();
  if (!listing) throw new Error(`No listing #${listingId}`);

  db.transaction((tx) => {
    tx.update(listings)
      .set({
        currencyOverride: currency,
        locationOverride: location,
        ...(currency ? { currency } : {}),
        ...(location ? { location } : {}),
      })
      .where(eq(listings.id, listingId))
      .run();
    if (currency) {
      tx.update(priceSnapshots).set({ currency }).where(eq(priceSnapshots.listingId, listingId)).run();
    }
  });

  const updated = db.select().from(listings).where(eq(listings.id, listingId)).get()!;
  const watch = db.select().from(watchlist).where(eq(watchlist.id, updated.watchId)).get()!;
  if (!isUnderTarget(rates, updated, watch)) {
    db.delete(alertsSent)
      .where(and(eq(alertsSent.listingId, listingId), eq(alertsSent.type, "under_target")))
      .run();
  }
  takeMarketSnapshot(updated.watchId, rates, now);
  return updated;
}

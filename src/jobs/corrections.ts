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
export async function correctListing(
  listingId: number,
  { currency, location }: { currency: Currency | null; location: string | null },
  rates: Rates,
  now = new Date(),
) {
  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  if (!listing) throw new Error(`No listing #${listingId}`);

  await db.transaction(async (tx) => {
    await tx
      .update(listings)
      .set({
        currencyOverride: currency,
        locationOverride: location,
        ...(currency ? { currency } : {}),
        ...(location ? { location } : {}),
      })
      .where(eq(listings.id, listingId));
    if (currency) {
      await tx.update(priceSnapshots).set({ currency }).where(eq(priceSnapshots.listingId, listingId));
    }
  });

  const [updated] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  const [watch] = await db.select().from(watchlist).where(eq(watchlist.id, updated.watchId)).limit(1);
  if (!isUnderTarget(rates, updated, watch)) {
    await db
      .delete(alertsSent)
      .where(and(eq(alertsSent.listingId, listingId), eq(alertsSent.type, "under_target")));
  }
  await takeMarketSnapshot(updated.watchId, rates, now);
  return updated;
}

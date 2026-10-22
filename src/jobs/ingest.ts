import { and, eq, lt, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { listings, priceSnapshots } from "@/db/schema";
import type { NormalizedListing } from "@/sources/types";

/** Daily checks a listing can be missing from before it's marked gone. */
export const MISSES_UNTIL_GONE = 3;

export interface IngestStats {
  added: number;
  updated: number;
  /** Seen through another source, matched by VIN. */
  matchedByVin: number;
  priceDrops: number;
  priceRises: number;
  /** Was gone, now listed again. */
  returned: number;
  /** Not in this search; one more miss counted. */
  missed: number;
  /** Reached MISSES_UNTIL_GONE in this run. */
  gone: number;
}

/**
 * Save one search's results for a watched car.
 *
 * - The same car is found by VIN first (within the watch, any source),
 *   otherwise by source plus its listing ID.
 * - A price snapshot is saved for a new car with a price and whenever the
 *   price changes.
 * - Only when `complete` (every page was fetched) do cars missing from the
 *   results count a miss. After MISSES_UNTIL_GONE misses in a row a car is
 *   marked gone, never deleted.
 */
export function recordListings({
  watchId,
  source,
  found,
  date,
  complete,
}: {
  watchId: number;
  source: string;
  found: NormalizedListing[];
  /** Local date of the check, YYYY-MM-DD. */
  date: string;
  complete: boolean;
}): IngestStats {
  const stats: IngestStats = {
    added: 0,
    updated: 0,
    matchedByVin: 0,
    priceDrops: 0,
    priceRises: 0,
    returned: 0,
    missed: 0,
    gone: 0,
  };

  db.transaction((tx) => {
    for (const l of found) {
      const existing =
        (l.vin &&
          tx
            .select()
            .from(listings)
            .where(and(eq(listings.watchId, watchId), eq(listings.vin, l.vin)))
            .get()) ||
        tx
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.watchId, watchId),
              eq(listings.source, source),
              eq(listings.sourceListingId, l.sourceListingId),
            ),
          )
          .get();

      if (!existing) {
        const row = tx
          .insert(listings)
          .values({ ...l, watchId, firstSeen: date, lastSeen: date, lastChecked: date })
          .returning({ id: listings.id })
          .get();
        if (l.price != null) {
          tx.insert(priceSnapshots)
            .values({ listingId: row.id, date, price: l.price, currency: l.currency })
            .run();
        }
        stats.added++;
        continue;
      }

      if (existing.status === "gone") stats.returned++;

      if (existing.source !== source) {
        // Another source owns this row; just note the car is still for sale.
        tx.update(listings)
          .set({ lastSeen: date, missedChecks: 0, status: "active" })
          .where(eq(listings.id, existing.id))
          .run();
        stats.matchedByVin++;
        continue;
      }

      if (l.price != null && l.price !== existing.price) {
        tx.insert(priceSnapshots)
          .values({ listingId: existing.id, date, price: l.price, currency: l.currency })
          .run();
        if (existing.price != null) {
          if (l.price < existing.price) stats.priceDrops++;
          else stats.priceRises++;
        }
      }

      const { source: _s, sourceListingId: _id, ...fields } = l;
      tx.update(listings)
        .set({
          ...fields,
          // A source sometimes drops a price it had; keep the last known one.
          price: l.price ?? existing.price,
          lastSeen: date,
          lastChecked: date,
          missedChecks: 0,
          status: "active",
        })
        .where(eq(listings.id, existing.id))
        .run();
      stats.updated++;
    }

    if (!complete) return;

    const notSeen = tx
      .select({ id: listings.id, missedChecks: listings.missedChecks })
      .from(listings)
      .where(
        and(
          eq(listings.watchId, watchId),
          eq(listings.source, source),
          eq(listings.status, "active"),
          lt(listings.lastSeen, date),
          // Count at most one miss per day, even if the check runs twice.
          or(isNull(listings.lastChecked), lt(listings.lastChecked, date)),
        ),
      )
      .all();

    for (const row of notSeen) {
      const missedChecks = row.missedChecks + 1;
      const gone = missedChecks >= MISSES_UNTIL_GONE;
      tx.update(listings)
        .set({ missedChecks, lastChecked: date, status: gone ? "gone" : "active" })
        .where(eq(listings.id, row.id))
        .run();
      stats.missed++;
      if (gone) stats.gone++;
    }
  });

  return stats;
}

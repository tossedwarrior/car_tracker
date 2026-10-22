import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertsSent, listings, priceSnapshots, watchlist } from "@/db/schema";
import type { Rates } from "@/lib/fx";
import { isUnderTarget } from "@/lib/money";

export type AlertType = (typeof alertsSent.$inferSelect)["type"];

export interface AlertCounts {
  new_listing: number;
  price_drop: number;
  under_target: number;
}

/**
 * After a source's results are saved, record alerts for one watched car:
 *
 * - new_listing: added by this refresh (`newListingIds`). Skipped on a
 *   source's first search for the car (`firstSearch`), when every car is "new".
 * - price_drop: today's price snapshot is lower than the one before.
 * - under_target: at or under the target price (converted to its currency),
 *   once per listing.
 *
 * alerts_sent's unique (listing, type, price) keeps each alert to one row,
 * so running this twice adds nothing.
 */
export function recordAlerts({
  watchId,
  source,
  date,
  rates,
  newListingIds,
  firstSearch,
}: {
  watchId: number;
  source: string;
  date: string;
  rates: Rates;
  newListingIds: number[];
  firstSearch: boolean;
}): AlertCounts {
  const counts: AlertCounts = { new_listing: 0, price_drop: 0, under_target: 0 };
  const watch = db.select().from(watchlist).where(eq(watchlist.id, watchId)).get();
  if (!watch) return counts;

  const rows = db
    .select()
    .from(listings)
    .where(and(eq(listings.watchId, watchId), eq(listings.source, source), eq(listings.status, "active")))
    .all();

  const add = (listingId: number, type: AlertType, price: number | null) => {
    const inserted = db
      .insert(alertsSent)
      .values({ listingId, type, price: price ?? 0, date })
      .onConflictDoNothing()
      .returning({ id: alertsSent.id })
      .get();
    if (inserted) counts[type]++;
  };
  const alreadyAlerted = (listingId: number, type: AlertType) =>
    !!db
      .select({ id: alertsSent.id })
      .from(alertsSent)
      .where(and(eq(alertsSent.listingId, listingId), eq(alertsSent.type, type)))
      .get();

  for (const l of rows) {
    if (!firstSearch && newListingIds.includes(l.id)) add(l.id, "new_listing", l.price);

    const [latest, previous] = db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.listingId, l.id))
      .orderBy(desc(priceSnapshots.date), desc(priceSnapshots.id))
      .limit(2)
      .all();
    if (latest?.date === date && previous && latest.price < previous.price) {
      add(l.id, "price_drop", latest.price);
    }

    if (isUnderTarget(rates, l, watch) && !alreadyAlerted(l.id, "under_target")) {
      add(l.id, "under_target", l.price);
    }
  }
  return counts;
}

export interface AlertRow {
  id: number;
  type: AlertType;
  price: number;
  date: string;
  seen: boolean;
  listing: typeof listings.$inferSelect;
  /** Price before the drop, for price_drop alerts. */
  previousPrice: number | null;
  watch: { id: number; make: string; model: string; trim: string | null };
}

export function getAlerts(limit = 200): AlertRow[] {
  const rows = db
    .select({ alert: alertsSent, listing: listings, watch: watchlist })
    .from(alertsSent)
    .innerJoin(listings, eq(alertsSent.listingId, listings.id))
    .innerJoin(watchlist, eq(listings.watchId, watchlist.id))
    .orderBy(desc(alertsSent.date), desc(alertsSent.id))
    .limit(limit)
    .all();

  return rows.map(({ alert, listing, watch }) => {
    let previousPrice: number | null = null;
    if (alert.type === "price_drop") {
      previousPrice =
        db
          .select({ price: priceSnapshots.price })
          .from(priceSnapshots)
          .where(
            and(
              eq(priceSnapshots.listingId, listing.id),
              sql`${priceSnapshots.date} < ${alert.date}`,
            ),
          )
          .orderBy(desc(priceSnapshots.date), desc(priceSnapshots.id))
          .get()?.price ?? null;
    }
    return {
      id: alert.id,
      type: alert.type,
      price: alert.price,
      date: alert.date,
      seen: alert.seen,
      listing,
      previousPrice,
      watch: { id: watch.id, make: watch.make, model: watch.model, trim: watch.trim },
    };
  });
}

export function countUnseenAlerts(): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(alertsSent)
      .where(eq(alertsSent.seen, false))
      .get()?.n ?? 0
  );
}

export function markAllAlertsSeen() {
  db.update(alertsSent).set({ seen: true }).where(eq(alertsSent.seen, false)).run();
}

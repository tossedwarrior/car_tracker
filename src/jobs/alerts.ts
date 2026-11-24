import { and, desc, eq, sql } from "drizzle-orm";
import { db, ignoreDuplicate, wasInserted } from "@/db";
import { alertsSent, follows, listings, priceSnapshots, watchlist } from "@/db/schema";
import type { Rates } from "@/lib/fx";
import { isUnderTarget } from "@/lib/money";

export type AlertType = (typeof alertsSent.$inferSelect)["type"];

export interface AlertCounts {
  new_listing: number;
  price_drop: number;
  under_target: number;
}

/**
 * After a source's results are saved, record alerts for one watched car, for
 * each person who follows it:
 *
 * - new_listing: added by this refresh (`newListingIds`). Skipped on a
 *   source's first search for the car (`firstSearch`), when every car is "new".
 * - price_drop: today's price snapshot is lower than the one before.
 * - under_target: at or under that person's target price (converted to its
 *   currency), once per listing.
 *
 * alerts_sent's unique (user, listing, type, price) keeps each alert to one
 * row, so running this twice adds nothing. The counts are per listing, not
 * per person: one new car followed by three people counts once.
 */
export async function recordAlerts({
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
}): Promise<AlertCounts> {
  const counts: AlertCounts = { new_listing: 0, price_drop: 0, under_target: 0 };
  const followers = await db.select().from(follows).where(eq(follows.watchId, watchId));
  if (followers.length === 0) return counts;

  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.watchId, watchId), eq(listings.source, source), eq(listings.status, "active")));

  /** Alert these people; counts the listing once if anyone new got it. */
  const add = async (userIds: number[], listingId: number, type: AlertType, price: number | null) => {
    let any = false;
    for (const userId of userIds) {
      const result = await db
        .insert(alertsSent)
        .values({ userId, listingId, type, price: price ?? 0, date })
        .onDuplicateKeyUpdate(ignoreDuplicate);
      any ||= wasInserted(result);
    }
    if (any) counts[type]++;
  };
  const alreadyAlerted = async (userId: number, listingId: number, type: AlertType) =>
    (
      await db
        .select({ id: alertsSent.id })
        .from(alertsSent)
        .where(and(eq(alertsSent.userId, userId), eq(alertsSent.listingId, listingId), eq(alertsSent.type, type)))
        .limit(1)
    ).length > 0;
  const everyone = followers.map((f) => f.userId);

  for (const l of rows) {
    if (!firstSearch && newListingIds.includes(l.id)) await add(everyone, l.id, "new_listing", l.price);

    const [latest, previous] = await db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.listingId, l.id))
      .orderBy(desc(priceSnapshots.date), desc(priceSnapshots.id))
      .limit(2);
    if (latest?.date === date && previous && latest.price < previous.price) {
      await add(everyone, l.id, "price_drop", latest.price);
    }

    const underTarget: number[] = [];
    for (const f of followers) {
      if (isUnderTarget(rates, l, f) && !(await alreadyAlerted(f.userId, l.id, "under_target"))) {
        underTarget.push(f.userId);
      }
    }
    if (underTarget.length) await add(underTarget, l.id, "under_target", l.price);
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

/** Someone's alerts, newest first. */
export async function getAlerts(userId: number, limit = 200): Promise<AlertRow[]> {
  const rows = await db
    .select({ alert: alertsSent, listing: listings, watch: watchlist })
    .from(alertsSent)
    .innerJoin(listings, eq(alertsSent.listingId, listings.id))
    .innerJoin(watchlist, eq(listings.watchId, watchlist.id))
    .where(eq(alertsSent.userId, userId))
    .orderBy(desc(alertsSent.date), desc(alertsSent.id))
    .limit(limit);

  const out: AlertRow[] = [];
  for (const { alert, listing, watch } of rows) {
    let previousPrice: number | null = null;
    if (alert.type === "price_drop") {
      const [before] = await db
          .select({ price: priceSnapshots.price })
          .from(priceSnapshots)
          .where(
            and(
              eq(priceSnapshots.listingId, listing.id),
              sql`${priceSnapshots.date} < ${alert.date}`,
            ),
          )
          .orderBy(desc(priceSnapshots.date), desc(priceSnapshots.id))
          .limit(1);
      previousPrice = before?.price ?? null;
    }
    out.push({
      id: alert.id,
      type: alert.type,
      price: alert.price,
      date: alert.date,
      seen: alert.seen,
      listing,
      previousPrice,
      watch: { id: watch.id, make: watch.make, model: watch.model, trim: watch.trim },
    });
  }
  return out;
}

export async function countUnseenAlerts(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(alertsSent)
    .where(and(eq(alertsSent.userId, userId), eq(alertsSent.seen, false)));
  return Number(row?.n ?? 0);
}

export async function markAllAlertsSeen(userId: number) {
  await db
    .update(alertsSent)
    .set({ seen: true })
    .where(and(eq(alertsSent.userId, userId), eq(alertsSent.seen, false)));
}

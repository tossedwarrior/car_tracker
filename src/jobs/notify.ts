import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertsSent, listings, users, watchlist } from "@/db/schema";
import { customerio } from "@/lib/customerio";
import { formatKm, watchTitle } from "@/lib/format";
import type { Rates } from "@/lib/fx";
import { showMoney } from "@/lib/money";
import { absoluteUrl } from "@/lib/site";

// After a refresh: one `new_listings` event per person who has new cars for
// sale on their list, for Customer.io's new-listing email campaign. One event
// (not one per car) so a refresh that finds five cars sends one email.

/** The newest alert so far; a refresh notifies about the ones after it. */
export async function latestAlertId(): Promise<number> {
  const [row] = await db.select({ id: sql<number | null>`max(${alertsSent.id})` }).from(alertsSent);
  return Number(row?.id ?? 0);
}

/** A new listing as the email shows it. */
export interface EmailListing {
  car: string;
  car_url: string;
  title: string;
  year: number | null;
  /** In the person's currency: "CA$249,000". */
  price: string;
  /** The seller's own price when it's in another currency: "US$178,000". */
  original_price: string | null;
  mileage: string;
  location: string | null;
  seller: string | null;
  url: string | null;
  under_target: boolean;
}

/**
 * Send a `new_listings` event to each person with new-listing alerts since
 * `afterAlertId`, if they want new-listing emails. Returns how many people.
 */
export async function notifyNewListings(afterAlertId: number, rates: Rates): Promise<number> {
  const cio = customerio();
  if (!cio) return 0;

  const rows = await db
    .select({ alert: alertsSent, listing: listings, watch: watchlist, user: users })
    .from(alertsSent)
    .innerJoin(listings, eq(alertsSent.listingId, listings.id))
    .innerJoin(watchlist, eq(listings.watchId, watchlist.id))
    .innerJoin(users, eq(alertsSent.userId, users.id))
    .where(
      and(
        gt(alertsSent.id, afterAlertId),
        isNotNull(alertsSent.userId),
        inArray(alertsSent.type, ["new_listing", "under_target"]),
      ),
    )
    .orderBy(asc(alertsSent.id));

  const byUser = new Map<number, typeof rows>();
  for (const r of rows) byUser.set(r.user.id, [...(byUser.get(r.user.id) ?? []), r]);

  let people = 0;
  for (const [userId, alerts] of byUser) {
    const user = alerts[0].user;
    if (!user.listingEmails) continue;
    const underTarget = new Set(alerts.filter((a) => a.alert.type === "under_target").map((a) => a.listing.id));
    const fresh = alerts.filter((a) => a.alert.type === "new_listing");
    if (fresh.length === 0) continue;

    const listed: EmailListing[] = fresh.map(({ listing: l, watch }) => {
      const shown = showMoney(rates, user.displayCurrency, l.price, l.currency);
      return {
        car: watchTitle(watch),
        car_url: absoluteUrl(`/watch/${watch.id}`),
        title: [l.year, l.make, l.model, l.trim && l.trim !== "Base" ? l.trim : null].filter(Boolean).join(" "),
        year: l.year,
        price: shown.main,
        original_price: shown.original,
        mileage: formatKm(l.km),
        location: l.location,
        seller: l.sellerName,
        url: l.url,
        under_target: underTarget.has(l.id),
      };
    });
    const cars = [...new Set(listed.map((l) => l.car))];
    await cio.track(
      userId,
      "new_listings",
      { count: listed.length, cars, listings: listed },
      // Same alerts, same id: Customer.io drops a repeat if this is retried.
      `new_listings-${userId}-${fresh[0].alert.id}-${fresh.at(-1)!.alert.id}`,
    );
    people++;
  }
  return people;
}

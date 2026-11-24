import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertsSent, follows, listings, users, watchlist } from "@/db/schema";
import { customerio } from "@/lib/customerio";
import { formatKm, watchTitle } from "@/lib/format";
import { Rates } from "@/lib/fx";
import { showMoney } from "@/lib/money";
import { absoluteUrl } from "@/lib/site";
import type { User } from "@/lib/users";
import { localDate } from "./budget";
import type { RefreshResult } from "./refresh";

// New-listing emails, once a month: on the day each person picks in Settings,
// their cars are refreshed and they get one `new_listings` event (Customer.io's
// new-listing campaign sends the email) with every car listed since their last
// one. Nothing's sent when nothing new was listed.
//
// The server checks every hour (src/instrumentation.ts), or a daily cron job
// can run `npm run listing-emails`. Either way each person gets one a month:
// the day moves on before anything is sent.

/** The day of the month they can pick: 1–28, so every month has it. */
export const LISTING_EMAIL_DAYS = 28;
/** Not before this hour (server time) on the day. */
export const LISTING_EMAIL_HOUR = 8;
/** A car refreshed this recently isn't refreshed again for the email. */
const FRESH_ENOUGH_MS = 12 * 60 * 60 * 1000;
/** Most listings in one email; `count` still says how many there were. */
const MAX_LISTINGS = 50;

export const clampDay = (day: number) =>
  Number.isInteger(day) ? Math.min(LISTING_EMAIL_DAYS, Math.max(1, day)) : 1;

const parseDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (ymd: string, days: number) => {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + days);
  return localDate(d);
};

/** The first date on or after `from` (YYYY-MM-DD) that falls on `day` of its month. */
export function nextListingEmailDate(day: number, from: string): string {
  const d = parseDate(from);
  const want = clampDay(day);
  if (d.getDate() > want) d.setMonth(d.getMonth() + 1, 1);
  d.setDate(want);
  return localDate(d);
}

/**
 * When a person's next email goes out after they pick `day`: from today, but
 * never within two weeks of the last one, so changing the day can't bring a
 * second email in the same month.
 */
export function scheduleListingEmail(day: number, today: string, lastSent: string | null): string {
  const earliest = lastSent && addDays(lastSent, 14) > today ? addDays(lastSent, 14) : today;
  return nextListingEmailDate(day, earliest);
}

/** The newest alert so far. */
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

function emailListing(
  l: typeof listings.$inferSelect,
  watch: typeof watchlist.$inferSelect,
  user: User,
  rates: Rates,
  underTarget: boolean,
): EmailListing {
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
    under_target: underTarget,
  };
}

/**
 * A sample of someone's email, to check the Customer.io campaign before their
 * day comes: the newest cars for sale for the ones they follow, as if just
 * listed, marked `sample: true`. Their day, and what their next real email
 * covers, don't change. Returns how many cars it showed (0: none sent).
 */
export async function sendSampleListingEmail(
  userId: number,
  { rates, count = 5, now = new Date() }: { rates?: Rates; count?: number; now?: Date } = {},
): Promise<number> {
  const cio = customerio();
  if (!cio) return 0;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return 0;
  const rows = await db
    .select({ listing: listings, watch: watchlist })
    .from(follows)
    .innerJoin(watchlist, eq(follows.watchId, watchlist.id))
    .innerJoin(listings, eq(listings.watchId, watchlist.id))
    .where(and(eq(follows.userId, userId), eq(listings.status, "active")))
    .orderBy(desc(listings.firstSeen), desc(listings.id))
    .limit(count);
  if (rows.length === 0) return 0;
  const underTarget = new Set(
    (
      await db
        .select({ id: alertsSent.listingId })
        .from(alertsSent)
        .where(
          and(
            eq(alertsSent.userId, userId),
            eq(alertsSent.type, "under_target"),
            inArray(alertsSent.listingId, rows.map((r) => r.listing.id)),
          ),
        )
    ).map((r) => r.id),
  );
  const shownRates = rates ?? (await Rates.load());
  const listed = rows.map(({ listing, watch }) =>
    emailListing(listing, watch, user, shownRates, underTarget.has(listing.id)),
  );
  await cio.track(
    user.id,
    "new_listings",
    {
      count: listed.length,
      cars: [...new Set(listed.map((l) => l.car))],
      listings: listed,
      since: user.listingEmailSentOn,
      sample: true,
    },
    // Every sample is its own message, so trying it twice sends twice.
    `new_listings-sample-${user.id}-${now.getTime()}`,
  );
  return listed.length;
}

/**
 * The `new_listings` event for one person: cars listed for the ones they follow
 * since their last email and still for sale. Moves their marker on whether or
 * not anything's sent. Returns whether an event went out.
 */
export async function sendListingEmail(user: User, rates: Rates, today: string): Promise<boolean> {
  const cio = customerio();
  if (!cio) return false;
  const rows = await db
    .select({ alert: alertsSent, listing: listings, watch: watchlist })
    .from(alertsSent)
    .innerJoin(listings, eq(alertsSent.listingId, listings.id))
    .innerJoin(watchlist, eq(listings.watchId, watchlist.id))
    .where(
      and(
        eq(alertsSent.userId, user.id),
        gt(alertsSent.id, user.listingsEmailedThrough),
        inArray(alertsSent.type, ["new_listing", "under_target"]),
      ),
    )
    .orderBy(asc(alertsSent.id));
  if (rows.length === 0) return false;
  const through = rows.at(-1)!.alert.id;

  const underTarget = new Set(rows.filter((r) => r.alert.type === "under_target").map((r) => r.listing.id));
  const fresh = rows.filter((r) => r.alert.type === "new_listing" && r.listing.status === "active");
  let sent = false;
  if (fresh.length) {
    const listed = fresh.map(({ listing, watch }) =>
      emailListing(listing, watch, user, rates, underTarget.has(listing.id)),
    );
    await cio.track(
      user.id,
      "new_listings",
      {
        count: listed.length,
        cars: [...new Set(listed.map((l) => l.car))],
        listings: listed.slice(0, MAX_LISTINGS),
        since: user.listingEmailSentOn,
      },
      // One a month: Customer.io drops a repeat if this is retried.
      `new_listings-${user.id}-${today}`,
    );
    sent = true;
  }
  await db.update(users).set({ listingsEmailedThrough: through }).where(eq(users.id, user.id));
  return sent;
}

export interface ListingEmailRun {
  /** People whose day it was. */
  due: number;
  /** Of those, how many had new cars to hear about. */
  sent: number;
  refresh: RefreshResult | null;
}

type Refresh = (options: { watchIds: number[]; now: Date }) => Promise<RefreshResult>;

/**
 * Send this month's new-listing email to everyone whose day it is (or was,
 * if the server was off then). Their cars are refreshed first, unless they
 * were in the last 12 hours.
 */
export async function sendDueListingEmails({
  now = new Date(),
  refresh,
  userIds,
  rates: givenRates,
}: {
  now?: Date;
  refresh?: Refresh;
  /** Exchange rates; the saved ones by default. */
  rates?: Rates;
  /** Just these people, whatever their day (`npm run listing-emails -- --user 3`). */
  userIds?: number[];
} = {}): Promise<ListingEmailRun> {
  const none = { due: 0, sent: 0, refresh: null };
  if (!customerio()) return none;
  const today = localDate(now);

  // People who've never had a day worked out: from tomorrow on.
  const unscheduled = await db
    .select({ id: users.id, day: users.listingEmailDay })
    .from(users)
    .where(isNull(users.listingEmailNext));
  for (const u of unscheduled) {
    const next = nextListingEmailDate(u.day, addDays(today, 1));
    await db.update(users).set({ listingEmailNext: next }).where(eq(users.id, u.id));
  }

  if (!userIds && now.getHours() < LISTING_EMAIL_HOUR) return none;
  const due = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.listingEmails, true),
        userIds ? inArray(users.id, userIds) : and(isNotNull(users.listingEmailNext), lte(users.listingEmailNext, today)),
      ),
    );
  if (due.length === 0) return none;

  // Their cars, refreshed once for everyone.
  const cars = await db
    .selectDistinct({ id: watchlist.id, lastRefreshed: watchlist.lastRefreshed })
    .from(follows)
    .innerJoin(watchlist, eq(follows.watchId, watchlist.id))
    .where(and(inArray(follows.userId, due.map((u) => u.id)), eq(watchlist.active, true)));
  const stale = cars
    .filter((c) => !c.lastRefreshed || now.getTime() - Date.parse(c.lastRefreshed) > FRESH_ENOUGH_MS)
    .map((c) => c.id);
  let refreshed: RefreshResult | null = null;
  if (stale.length) {
    const run = refresh ?? (await import("./refresh")).runRefresh;
    refreshed = await run({ watchIds: stale, now });
  }

  const rates = givenRates ?? (await Rates.load());
  let sent = 0;
  for (const user of due) {
    // Claim it first: the day moves on, so another check (a second server
    // process, or the cron job) finds nothing to do.
    const next = nextListingEmailDate(user.listingEmailDay, addDays(today, 1));
    const claimed = await db
      .update(users)
      .set({ listingEmailNext: next, listingEmailSentOn: today })
      .where(
        and(
          eq(users.id, user.id),
          user.listingEmailNext === null
            ? isNull(users.listingEmailNext)
            : eq(users.listingEmailNext, user.listingEmailNext),
        ),
      );
    if (claimed[0].affectedRows === 0) continue;
    try {
      if (await sendListingEmail(user, rates, today)) sent++;
    } catch (e) {
      // Try again at the next check.
      await db
        .update(users)
        .set({ listingEmailNext: user.listingEmailNext ?? today, listingEmailSentOn: user.listingEmailSentOn })
        .where(eq(users.id, user.id));
      console.warn(`[listing emails] not sent to user ${user.id}: ${(e as Error).message}`);
    }
  }
  return { due: due.length, sent, refresh: refreshed };
}

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { follows } from "@/db/schema";
import { customerio, unixTime, type Traits } from "./customerio";
import { Rates } from "./fx";
import { getHomeCars } from "./home";
import { absoluteUrl } from "./site";
import { getUser, type User } from "./users";

// What the app tells Customer.io about each person: who they are, their email
// preferences, and the cars they follow with each car's market numbers (the
// monthly report's Liquid loops over `cars`). Every function is a no-op until
// CUSTOMERIO_PIPELINES_KEY is set.

/** One followed car, as the monthly report and new-listing emails show it. */
export interface ProfileCar {
  id: number;
  title: string;
  years: string;
  url: string;
  for_sale: number;
  new_this_week: number;
  /** Cheapest asking price, in the person's currency ("CA$249,000"), or null. */
  lowest: string | null;
  /** "rising", "flat" or "cooling"; null until there's enough history. */
  trend: string | null;
  /** Change in the typical price over 3 months, e.g. -4 for 4% down. */
  trend_percent: number | null;
}

export async function profileCars(user: Pick<User, "id" | "displayCurrency">, rates?: Rates): Promise<ProfileCar[]> {
  const cars = await getHomeCars(user.id, rates ?? (await Rates.load()), user.displayCurrency);
  return cars.map((c) => ({
    id: c.id,
    title: c.title,
    years: c.years,
    url: absoluteUrl(`/watch/${c.id}`),
    for_sale: c.forSale,
    new_this_week: c.newListings,
    lowest: c.lowest?.main ?? null,
    trend: c.trend?.label ?? null,
    trend_percent: c.trend ? Math.round(c.trend.change * 1000) / 10 : null,
  }));
}

/** Everything Customer.io keeps on a person's profile. */
export function profileTraits(user: User, cars: ProfileCar[]): Traits {
  return {
    email: user.email,
    name: user.name ?? undefined,
    created_at: unixTime(user.createdAt),
    last_sign_in_at: unixTime(user.lastSignInAt),
    listing_emails: user.listingEmails,
    listing_email_day: user.listingEmailDay,
    monthly_report: user.monthlyReport,
    currency: user.displayCurrency,
    cars_followed: cars.length,
    cars,
  };
}

/** Send a person's current profile to Customer.io. */
export async function syncPerson(userId: number, rates?: Rates) {
  const cio = customerio();
  if (!cio) return;
  const user = await getUser(userId);
  if (!user) return;
  await cio.identify(user.id, profileTraits(user, await profileCars(user, rates)));
}

/** After a refresh: update everyone who follows any of these cars. */
export async function syncFollowersOf(watchIds: number[], rates?: Rates) {
  if (!customerio() || watchIds.length === 0) return;
  const rows = await db.select({ userId: follows.userId }).from(follows).where(inArray(follows.watchId, watchIds));
  for (const userId of new Set(rows.map((r) => r.userId))) await syncPerson(userId, rates);
}

export async function trackPerson(userId: number, event: string, properties?: Traits, messageId?: string) {
  await customerio()?.track(userId, event, properties, messageId);
}

/**
 * A deleted account: say so (the churn email's trigger) and empty the
 * profile, rather than delete it, so that email can still reach them.
 */
export async function recordAccountDeleted(user: User, now = new Date()) {
  const cio = customerio();
  if (!cio) return;
  await cio.identify(user.id, {
    email: user.email,
    deleted_at: unixTime(now.toISOString()),
    listing_emails: false,
    monthly_report: false,
    cars_followed: 0,
    cars: [],
  });
  await cio.track(user.id, "account_deleted");
}

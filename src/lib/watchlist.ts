import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertsSent, currencies, follows, listings, watchlist, type Currency } from "@/db/schema";
import type { Rates } from "./fx";
import type { User } from "./users";

/** A car search: what the sources are asked for, shared by everyone who follows it. */
export type CarSearch = typeof watchlist.$inferSelect;
/** A car search as one person sees it, with their own target price and notes. */
export type Watch = CarSearch & {
  targetPrice: number | null;
  targetCurrency: Currency;
  notes: string | null;
};
/** The add/edit form: the search, then the person's own target and notes. */
export interface WatchInput {
  make: string;
  model: string;
  yearMin: number;
  yearMax: number;
  maxKm: number | null;
  trim: string | null;
  targetPrice: number | null;
  targetCurrency: Currency;
  notes: string | null;
}
export type Listing = typeof listings.$inferSelect;

/** Cars one person can follow (the owner has no limit), to keep within the sources' free calls. */
export const maxCarsPerUser = () => Number(process.env.MAX_CARS_PER_USER) || 5;

export type FormErrors = Partial<Record<keyof WatchInput | "form" | "logo" | "photo", string>>;

const MIN_YEAR = 1950;

/** "250,000" / "$250000" → 250000. Empty → null. Anything else → NaN. */
function parseWhole(value: FormDataEntryValue | null): number | null {
  const s = String(value ?? "").replace(/[\s,$]/g, "");
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;

/** Validate the add/edit form. Returns the clean values or per-field errors. */
export function parseWatchForm(
  form: FormData,
  now = new Date(),
): { ok: true; values: WatchInput } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const maxYear = now.getFullYear() + 1;

  const make = text(form.get("make"));
  const model = text(form.get("model"));
  if (!make) errors.make = "Enter a make";
  if (!model) errors.model = "Enter a model";

  const yearMin = parseWhole(form.get("yearMin"));
  const yearMax = parseWhole(form.get("yearMax")) ?? yearMin;
  const validYear = (y: number | null) => y !== null && y >= MIN_YEAR && y <= maxYear;
  if (!validYear(yearMin)) errors.yearMin = `Enter a year from ${MIN_YEAR} to ${maxYear}`;
  else if (!validYear(yearMax)) errors.yearMax = `Enter a year from ${MIN_YEAR} to ${maxYear}`;
  else if (yearMax! < yearMin!) errors.yearMax = "Must be the same as or after the first year";

  const maxKm = parseWhole(form.get("maxKm"));
  if (Number.isNaN(maxKm) || maxKm === 0) errors.maxKm = "Enter a whole number of km, or leave blank";

  const targetPrice = parseWhole(form.get("targetPrice"));
  if (Number.isNaN(targetPrice) || targetPrice === 0) {
    errors.targetPrice = "Enter a whole dollar amount, or leave blank";
  }

  const targetCurrency = String(form.get("targetCurrency") ?? "CAD") as Currency;
  if (!currencies.includes(targetCurrency)) errors.targetCurrency = "Pick CAD or USD";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: {
      make: make!,
      model: model!,
      yearMin: yearMin!,
      yearMax: yearMax!,
      maxKm,
      trim: text(form.get("trim")),
      targetPrice,
      targetCurrency,
      notes: text(form.get("notes")),
    },
  };
}

const searchOf = (v: WatchInput) => ({
  make: v.make,
  model: v.model,
  yearMin: v.yearMin,
  yearMax: v.yearMax,
  maxKm: v.maxKm,
  trim: v.trim,
});
const followOf = (v: WatchInput) => ({ targetPrice: v.targetPrice, targetCurrency: v.targetCurrency, notes: v.notes });

/** Same search: same make, model and trim (any case), years and mileage. */
export function sameSearch(a: WatchInput | CarSearch, b: WatchInput | CarSearch): boolean {
  const lower = (s: string | null) => s?.toLowerCase() ?? null;
  return (
    lower(a.make) === lower(b.make) &&
    lower(a.model) === lower(b.model) &&
    lower(a.trim) === lower(b.trim) &&
    a.yearMin === b.yearMin &&
    a.yearMax === b.yearMax &&
    (a.maxKm ?? null) === (b.maxKm ?? null)
  );
}

/** An existing search for the same car, so a second person shares its listings and calls. */
async function findSearch(v: WatchInput): Promise<CarSearch | undefined> {
  const candidates = await db
    .select()
    .from(watchlist)
    .where(and(sql`lower(${watchlist.make}) = ${v.make.toLowerCase()}`, sql`lower(${watchlist.model}) = ${v.model.toLowerCase()}`));
  return candidates.find((c) => sameSearch(c, v));
}

const withFollow = (watch: CarSearch, f: typeof follows.$inferSelect): Watch => ({
  ...watch,
  targetPrice: f.targetPrice,
  targetCurrency: f.targetCurrency,
  notes: f.notes,
});

/** A car this person follows, with their target and notes; undefined if they don't follow it. */
export async function getWatch(userId: number, id: number): Promise<Watch | undefined> {
  const [row] = await db
    .select({ watch: watchlist, follow: follows })
    .from(follows)
    .innerJoin(watchlist, eq(follows.watchId, watchlist.id))
    .where(and(eq(follows.userId, userId), eq(follows.watchId, id)))
    .limit(1);
  return row && withFollow(row.watch, row.follow);
}

export async function countFollowers(watchId: number): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(follows).where(eq(follows.watchId, watchId));
  return Number(row?.n ?? 0);
}

async function countFollowing(userId: number): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(follows).where(eq(follows.userId, userId));
  return Number(row?.n ?? 0);
}

async function follow(userId: number, watchId: number, v: WatchInput) {
  await db
    .insert(follows)
    .values({ userId, watchId, ...followOf(v) })
    .onDuplicateKeyUpdate({ set: followOf(v) });
}

/**
 * Add a car to someone's list: follow the matching search if there is one,
 * otherwise start a new one. Errors when they're at their limit.
 */
export async function addCar(
  user: Pick<User, "id" | "isAdmin">,
  v: WatchInput,
  { checkLimit = true } = {},
): Promise<{ watchId: number } | { error: string }> {
  const existing = await findSearch(v);
  const alreadyFollowing = existing ? !!(await getWatch(user.id, existing.id)) : false;
  if (checkLimit && !user.isAdmin && !alreadyFollowing && (await countFollowing(user.id)) >= maxCarsPerUser()) {
    return { error: `You can follow up to ${maxCarsPerUser()} cars. Remove one to add another.` };
  }
  let watchId = existing?.id;
  if (watchId) {
    await db.update(watchlist).set({ active: true }).where(eq(watchlist.id, watchId));
  } else {
    [{ id: watchId }] = await db.insert(watchlist).values(searchOf(v)).$returningId();
  }
  await follow(user.id, watchId, v);
  return { watchId };
}

/**
 * Save the edit form for a car someone follows. Their target and notes are
 * theirs alone. A changed search is changed in place when nobody else
 * follows it; otherwise they move to the new search and the others keep the
 * old one. Returns the car's id, which changes if they moved.
 */
export async function updateCar(user: Pick<User, "id" | "isAdmin">, watchId: number, v: WatchInput): Promise<number> {
  const [current] = await db.select().from(watchlist).where(eq(watchlist.id, watchId)).limit(1);
  if (sameSearch(current, v)) {
    await follow(user.id, watchId, v);
    return watchId;
  }
  const elsewhere = await findSearch(v);
  if (!elsewhere && (await countFollowers(watchId)) === 1) {
    await db.update(watchlist).set(searchOf(v)).where(eq(watchlist.id, watchId));
    await follow(user.id, watchId, v);
    return watchId;
  }
  await unfollow(user.id, watchId);
  const added = await addCar(user, v, { checkLimit: false });
  return "watchId" in added ? added.watchId : watchId;
}

/** Take a car off someone's list, with their alerts for it. Nobody left following it: it's deleted. */
export async function unfollow(userId: number, watchId: number) {
  await db.delete(follows).where(and(eq(follows.userId, userId), eq(follows.watchId, watchId)));
  const ids = (await db.select({ id: listings.id }).from(listings).where(eq(listings.watchId, watchId))).map((r) => r.id);
  if (ids.length) await db.delete(alertsSent).where(and(eq(alertsSent.userId, userId), inArray(alertsSent.listingId, ids)));
  await deleteIfUnfollowed(watchId);
}

/** Deletes a search nobody follows and, through the foreign keys, its listings and history. */
export async function deleteIfUnfollowed(watchId: number) {
  if ((await countFollowers(watchId)) === 0) await db.delete(watchlist).where(eq(watchlist.id, watchId));
}

/** The ids of the cars someone follows. */
export async function followedIds(userId: number): Promise<number[]> {
  return (await db.select({ id: follows.watchId }).from(follows).where(eq(follows.userId, userId))).map((r) => r.id);
}

export interface WatchSummary extends Watch {
  activeCount: number;
  /** Cheapest active listing per currency. */
  lowest: Array<{ currency: Currency; price: number }>;
}

/** The cars someone follows, with what's for sale for each. */
export async function listWatches(userId: number): Promise<WatchSummary[]> {
  const watches: Watch[] = (
    await db
      .select({ watch: watchlist, follow: follows })
      .from(follows)
      .innerJoin(watchlist, eq(follows.watchId, watchlist.id))
      .where(eq(follows.userId, userId))
      .orderBy(asc(watchlist.make), asc(watchlist.model))
  ).map(({ watch, follow: f }) => withFollow(watch, f));
  const counts = await db
    .select({ watchId: listings.watchId, n: sql<number>`count(*)` })
    .from(listings)
    .where(eq(listings.status, "active"))
    .groupBy(listings.watchId);
  const lows = await db
    .select({
      watchId: listings.watchId,
      currency: listings.currency,
      price: sql<number>`min(${listings.price})`,
    })
    .from(listings)
    .where(and(eq(listings.status, "active"), sql`${listings.price} is not null`))
    .groupBy(listings.watchId, listings.currency);

  return watches.map((w) => ({
    ...w,
    activeCount: Number(counts.find((c) => c.watchId === w.id)?.n ?? 0),
    lowest: lows
      .filter((l) => l.watchId === w.id)
      .map(({ currency, price }) => ({ currency, price: Number(price) })),
  }));
}

/** Sort options, in menu order. Missing prices and mileages always go last. */
export const listingSorts = {
  price: { label: "Price: low to high", order: [sql`${listings.price} is null`, asc(listings.price)] },
  "price-desc": { label: "Price: high to low", order: [sql`${listings.price} is null`, desc(listings.price)] },
  km: { label: "Mileage: low to high", order: [sql`${listings.km} is null`, asc(listings.km)] },
  "km-desc": { label: "Mileage: high to low", order: [sql`${listings.km} is null`, desc(listings.km)] },
  newest: {
    label: "Newest listed",
    order: [desc(sql`coalesce(${listings.listedAt}, ${listings.firstSeen})`)],
  },
  year: { label: "Year: newest first", order: [desc(listings.year), asc(listings.price)] },
} as const;
export type ListingSort = keyof typeof listingSorts;

export function getListings(
  watchId: number,
  { sort = "price", includeGone = false }: { sort?: ListingSort; includeGone?: boolean } = {},
): Promise<Listing[]> {
  return db
    .select()
    .from(listings)
    .where(
      includeGone
        ? eq(listings.watchId, watchId)
        : and(eq(listings.watchId, watchId), eq(listings.status, "active")),
    )
    .orderBy(...listingSorts[sort].order);
}

/**
 * Sort by price across currencies (SQL can only compare the raw numbers),
 * converted to CAD at the latest rate. Listings without a price go last.
 */
export function sortByPrice<T extends { price: number | null; currency: string }>(
  rows: T[],
  rates: Rates,
  direction: "asc" | "desc",
): T[] {
  const cad = (l: T) => (l.price == null ? null : (rates.convert(l.price, l.currency, "CAD") ?? l.price));
  return [...rows].sort((a, b) => {
    const x = cad(a);
    const y = cad(b);
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
    return direction === "asc" ? x - y : y - x;
  });
}

export async function countGone(watchId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(listings)
    .where(and(eq(listings.watchId, watchId), eq(listings.status, "gone")));
  return Number(row?.n ?? 0);
}

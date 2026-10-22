import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { currencies, listings, watchlist, type Currency } from "@/db/schema";

export type Watch = typeof watchlist.$inferSelect;
export type WatchInput = Omit<Watch, "id" | "createdAt" | "active" | "lastRefreshed" | "lastSoldPull">;
export type Listing = typeof listings.$inferSelect;

export type FormErrors = Partial<Record<keyof WatchInput | "form", string>>;

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

export function getWatch(id: number): Watch | undefined {
  return db.select().from(watchlist).where(eq(watchlist.id, id)).get();
}

export function createWatch(values: WatchInput): number {
  return db.insert(watchlist).values(values).returning({ id: watchlist.id }).get().id;
}

export function updateWatch(id: number, values: WatchInput) {
  db.update(watchlist).set(values).where(eq(watchlist.id, id)).run();
}

/** Deletes the watch and, through the foreign keys, its listings and history. */
export function deleteWatch(id: number) {
  db.delete(watchlist).where(eq(watchlist.id, id)).run();
}

export interface WatchSummary extends Watch {
  activeCount: number;
  /** Cheapest active listing per currency. */
  lowest: Array<{ currency: Currency; price: number }>;
}

export function listWatches(): WatchSummary[] {
  const watches = db.select().from(watchlist).orderBy(asc(watchlist.make), asc(watchlist.model)).all();
  const counts = db
    .select({ watchId: listings.watchId, n: sql<number>`count(*)` })
    .from(listings)
    .where(eq(listings.status, "active"))
    .groupBy(listings.watchId)
    .all();
  const lows = db
    .select({
      watchId: listings.watchId,
      currency: listings.currency,
      price: sql<number>`min(${listings.price})`,
    })
    .from(listings)
    .where(and(eq(listings.status, "active"), sql`${listings.price} is not null`))
    .groupBy(listings.watchId, listings.currency)
    .all();

  return watches.map((w) => ({
    ...w,
    activeCount: counts.find((c) => c.watchId === w.id)?.n ?? 0,
    lowest: lows
      .filter((l) => l.watchId === w.id)
      .map(({ currency, price }) => ({ currency, price })),
  }));
}

export const listingSorts = {
  price: { label: "Price", order: [sql`${listings.price} is null`, asc(listings.price)] },
  newest: {
    label: "Newest",
    order: [desc(sql`coalesce(${listings.listedAt}, ${listings.firstSeen})`)],
  },
  km: { label: "Mileage", order: [sql`${listings.km} is null`, asc(listings.km)] },
  year: { label: "Year", order: [desc(listings.year), asc(listings.price)] },
} as const;
export type ListingSort = keyof typeof listingSorts;

export function getListings(
  watchId: number,
  { sort = "price", includeGone = false }: { sort?: ListingSort; includeGone?: boolean } = {},
): Listing[] {
  return db
    .select()
    .from(listings)
    .where(
      includeGone
        ? eq(listings.watchId, watchId)
        : and(eq(listings.watchId, watchId), eq(listings.status, "active")),
    )
    .orderBy(...listingSorts[sort].order)
    .all();
}

export function countGone(watchId: number): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(listings)
      .where(and(eq(listings.watchId, watchId), eq(listings.status, "gone")))
      .get()?.n ?? 0
  );
}

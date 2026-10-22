import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { listings, marketSnapshots, watchlist } from "@/db/schema";
import { daysSince } from "@/lib/format";
import type { Rates } from "@/lib/fx";
import { getSoldResults, median } from "./sold";

/** Market snapshots and medians are kept in CAD and converted for display. */
export const MARKET_CURRENCY = "CAD";
/** Window of auction sales behind each snapshot's typical sale price. */
const SOLD_WINDOW_DAYS = 90;
/** The trend label compares the typical price now with this long ago... */
const TREND_SPAN_DAYS = 91;
/** ...and calls it rising or cooling past this change. */
const TREND_THRESHOLD = 0.03;
/** The chart covers this much history. */
export const HISTORY_DAYS = 2 * 365;

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week containing `now`, as YYYY-MM-DD (local calendar). */
export function weekStart(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Save this week's market snapshot for a watched car: typical (median)
 * asking price, typical sale over the last 90 days, how many are listed and
 * for how long. Taken on refresh; a later refresh in the same week replaces
 * it, so each week keeps its latest picture.
 */
export function takeMarketSnapshot(watchId: number, rates: Rates, now = new Date()) {
  const watch = db.select().from(watchlist).where(eq(watchlist.id, watchId)).get();
  if (!watch) return;

  const active = db
    .select()
    .from(listings)
    .where(and(eq(listings.watchId, watchId), eq(listings.status, "active")))
    .all();
  const asks = active
    .map((l) => (l.price == null ? null : rates.convert(l.price, l.currency, MARKET_CURRENCY)))
    .filter((v): v is number => v != null);

  const since = iso(new Date(now.getTime() - SOLD_WINDOW_DAYS * DAY));
  const sales = getSoldResults(watch)
    .filter((r) => r.soldDate >= since)
    .map((r) => rates.convert(r.price, r.currency, MARKET_CURRENCY, r.soldDate))
    .filter((v): v is number => v != null);

  const values = {
    medianAsk: median(asks),
    medianSold: median(sales),
    listingCount: active.length,
    medianDaysListed: median(active.map((l) => daysSince(l.listedAt ?? l.firstSeen, now))),
    currency: MARKET_CURRENCY,
  } as const;

  db.insert(marketSnapshots)
    .values({ watchId, week: weekStart(now), ...values })
    .onConflictDoUpdate({ target: [marketSnapshots.watchId, marketSnapshots.week], set: values })
    .run();
}

export interface Point {
  /** YYYY-MM-DD: week start, or the 15th for a monthly point. */
  date: string;
  value: number;
}

export type TrendLabel = "rising" | "flat" | "cooling";

export interface Trend {
  label: TrendLabel | null;
  /** Fractional change behind the label, e.g. 0.042. */
  change: number | null;
  /** Which price the label is based on. */
  basis: "asking" | "sold" | null;
  /** Why there's no label yet. */
  reason: string | null;
}

/**
 * Rising if the typical price is up more than 3% over 3 months, cooling if
 * down more than 3%, otherwise flat. Compares the latest point with the last
 * one at least 3 months older. Null when the series doesn't reach back 3 months.
 */
export function trendOf(points: Point[]): { label: TrendLabel; change: number } | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const cutoff = iso(new Date(new Date(latest.date).getTime() - TREND_SPAN_DAYS * DAY));
  const base = points.filter((p) => p.date <= cutoff).at(-1);
  if (!base || base.value <= 0) return null;
  const change = latest.value / base.value - 1;
  const label = change > TREND_THRESHOLD ? "rising" : change < -TREND_THRESHOLD ? "cooling" : "flat";
  return { label, change };
}

export interface MarketHistory {
  /** Weekly typical asking price (CAD). */
  ask: Point[];
  /** Monthly typical auction sale (CAD, at each sale's rate), with sale counts. */
  sold: Array<Point & { count: number }>;
  /** Weekly number of cars listed. */
  listed: Point[];
  /** Weekly median days a car has been listed. */
  daysListed: Point[];
  trend: Trend;
}

/** Everything the market trend page charts, for the last two years. */
export function getMarketHistory(
  watch: { id: number; make: string; model: string; yearMin: number; yearMax: number },
  rates: Rates,
  now = new Date(),
): MarketHistory {
  const since = iso(new Date(now.getTime() - HISTORY_DAYS * DAY));
  const snaps = db
    .select()
    .from(marketSnapshots)
    .where(and(eq(marketSnapshots.watchId, watch.id), gte(marketSnapshots.week, since)))
    .orderBy(asc(marketSnapshots.week))
    .all();

  const byMonth = new Map<string, number[]>();
  for (const r of getSoldResults(watch)) {
    if (r.soldDate < since) continue;
    const cad = rates.convert(r.price, r.currency, MARKET_CURRENCY, r.soldDate);
    if (cad == null) continue;
    const month = r.soldDate.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), cad]);
  }
  const sold = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, prices]) => ({ date: `${month}-15`, value: median(prices)!, count: prices.length }));

  const ask = snaps.flatMap((s) => (s.medianAsk == null ? [] : [{ date: s.week, value: s.medianAsk }]));
  const listed = snaps.map((s) => ({ date: s.week, value: s.listingCount }));
  const daysListed = snaps.flatMap((s) =>
    s.medianDaysListed == null ? [] : [{ date: s.week, value: s.medianDaysListed }],
  );

  // Asking prices are the main signal; auction sales stand in until there
  // are 3 months of asking history.
  const fromAsk = trendOf(ask);
  const fromSold = trendOf(sold);
  const trend: Trend = fromAsk
    ? { ...fromAsk, basis: "asking", reason: null }
    : fromSold
      ? { ...fromSold, basis: "sold", reason: null }
      : {
          label: null,
          change: null,
          basis: null,
          reason:
            "Needs 3 months of history. Asking prices are tracked weekly from your first refresh; " +
            "auction sales cover only what Old Cars Data has returned so far.",
        };

  return { ask, sold, listed, daysListed, trend };
}

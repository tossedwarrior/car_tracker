import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { listings, marketSnapshots, priceSnapshots, watchlist } from "@/db/schema";
import { daysSince } from "@/lib/format";
import type { Rates } from "@/lib/fx";
import { variantOf } from "@/lib/variants";
import { getSoldResults, median, percentile } from "./sold";

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
export async function takeMarketSnapshot(watchId: number, rates: Rates, now = new Date()) {
  const [watch] = await db.select().from(watchlist).where(eq(watchlist.id, watchId)).limit(1);
  if (!watch) return;

  const active = await db
    .select()
    .from(listings)
    .where(and(eq(listings.watchId, watchId), eq(listings.status, "active")));
  const asks = active
    .map((l) => (l.price == null ? null : rates.convert(l.price, l.currency, MARKET_CURRENCY)))
    .filter((v): v is number => v != null);

  const since = iso(new Date(now.getTime() - SOLD_WINDOW_DAYS * DAY));
  const sales = (await getSoldResults(watch))
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

  await db
    .insert(marketSnapshots)
    .values({ watchId, week: weekStart(now), ...values })
    .onDuplicateKeyUpdate({ set: values });
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

/** One auction sale, for plotting each sale as its own dot. */
export interface SalePoint extends Point {
  /** Value is in CAD at the sale-date rate; this is what it sold for. */
  price: number;
  currency: string;
  title: string;
  auctionHouse: string | null;
  url: string | null;
  variant: string;
}

/** A month of auction sales: the median plus the middle half of prices. */
export interface MonthBand extends Point {
  count: number;
  /** 25th and 75th percentile; equal to the median for a single sale. */
  low: number;
  high: number;
}

export interface MarketHistory {
  /** Weekly typical asking price (CAD). */
  ask: Point[];
  /** Every auction sale in the window, oldest first. */
  sales: SalePoint[];
  /** Monthly typical auction sale (CAD, at each sale's rate), with sale counts and spread. */
  sold: MonthBand[];
  /** Weekly number of cars listed. */
  listed: Point[];
  /** Weekly median days a car has been listed. */
  daysListed: Point[];
  trend: Trend;
}

type WatchRef = { id: number; make: string; model: string; yearMin: number; yearMax: number };

/**
 * Everything the market trend page charts, for the last two years. With a
 * `variant`, only auction sales of that variant; weekly asking history isn't
 * kept per variant, so it's left out then.
 */
export async function getMarketHistory(
  watch: WatchRef,
  rates: Rates,
  now = new Date(),
  { variant }: { variant?: string | null } = {},
): Promise<MarketHistory> {
  const since = iso(new Date(now.getTime() - HISTORY_DAYS * DAY));
  const snaps = await db
    .select()
    .from(marketSnapshots)
    .where(and(eq(marketSnapshots.watchId, watch.id), gte(marketSnapshots.week, since)))
    .orderBy(asc(marketSnapshots.week));

  const byMonth = new Map<string, number[]>();
  const sales: SalePoint[] = [];
  for (const r of await getSoldResults(watch)) {
    if (r.soldDate < since) continue;
    const v = variantOf(r.title);
    if (variant && v !== variant) continue;
    const cad = rates.convert(r.price, r.currency, MARKET_CURRENCY, r.soldDate);
    if (cad == null) continue;
    const month = r.soldDate.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), cad]);
    sales.push({
      date: r.soldDate,
      value: cad,
      price: r.price,
      currency: r.currency,
      title: r.title,
      auctionHouse: r.auctionHouse,
      url: r.url,
      variant: v,
    });
  }
  sales.reverse();
  const sold = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, prices]) => ({
      date: `${month}-15`,
      value: median(prices)!,
      count: prices.length,
      low: percentile(prices, 25)!,
      high: percentile(prices, 75)!,
    }));

  const weekly = variant ? [] : snaps;
  const ask = weekly.flatMap((s) => (s.medianAsk == null ? [] : [{ date: s.week, value: s.medianAsk }]));
  const listed = weekly.map((s) => ({ date: s.week, value: s.listingCount }));
  const daysListed = weekly.flatMap((s) =>
    s.medianDaysListed == null ? [] : [{ date: s.week, value: s.medianDaysListed }],
  );

  // Asking prices are the main signal; auction sales stand in until there
  // are 3 months of asking history (and always for a single variant).
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

  return { ask, sales, sold, listed, daysListed, trend };
}

export interface VariantRow {
  variant: string;
  listed: number;
  /** Median asking price of current listings (CAD, latest rate). */
  medianAsk: number | null;
  sales: number;
  /** Median auction sale over the last two years (CAD, sale-date rates). */
  medianSold: number | null;
  /** How far asking sits above (+) or below (−) sales. */
  gap: number | null;
}

export interface YearRow {
  year: number;
  listed: number;
  medianAsk: number | null;
  medianKm: number | null;
  sales: number;
  medianSold: number | null;
}

export interface MarketDetails {
  /** Every variant seen, most common first. */
  variants: VariantRow[];
  /** Each model year in the watch, oldest first (for the chosen variant). */
  years: YearRow[];
  /** Typical sale in the last 3 months vs the 3 months before. */
  momentum: { recent: number | null; recentCount: number; prior: number | null; priorCount: number; change: number | null };
  /** Current listings whose price was cut in the last 30 days. */
  priceCuts: { cut: number; of: number; medianCut: number | null };
  /** Typical asking now vs typical sale over the last 3 months. */
  askVsSold: { ask: number | null; sold: number | null; gap: number | null };
}

const gapOf = (ask: number | null, sold: number | null) =>
  ask != null && sold ? ask / sold - 1 : null;

/**
 * The numbers behind the market trend page: by variant, by year, recent
 * momentum, price cuts and asking vs sold. In CAD; `variant` narrows
 * everything except the variant table.
 */
export async function getMarketDetails(
  watch: WatchRef,
  rates: Rates,
  now = new Date(),
  { variant }: { variant?: string | null } = {},
): Promise<MarketDetails> {
  const since = iso(new Date(now.getTime() - HISTORY_DAYS * DAY));
  const daysAgo = (n: number) => iso(new Date(now.getTime() - n * DAY));

  const active = (
    await db
      .select()
      .from(listings)
      .where(and(eq(listings.watchId, watch.id), eq(listings.status, "active")))
  ).map((l) => ({
      ...l,
      variant: variantOf(l.title, l.trim),
      cad: l.price == null ? null : rates.convert(l.price, l.currency, MARKET_CURRENCY),
    }));
  const sales = (await getSoldResults(watch))
    .filter((r) => r.soldDate >= since)
    .map((r) => ({
      ...r,
      variant: variantOf(r.title),
      cad: rates.convert(r.price, r.currency, MARKET_CURRENCY, r.soldDate),
    }));
  const prices = (xs: Array<{ cad: number | null }>) => xs.flatMap((x) => (x.cad == null ? [] : [x.cad]));

  const names = new Map<string, number>();
  for (const x of [...active, ...sales]) names.set(x.variant, (names.get(x.variant) ?? 0) + 1);
  const variants = [...names.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => {
      const l = active.filter((x) => x.variant === name);
      const s = sales.filter((x) => x.variant === name);
      const medianAsk = median(prices(l));
      const medianSold = median(prices(s));
      return { variant: name, listed: l.length, medianAsk, sales: s.length, medianSold, gap: gapOf(medianAsk, medianSold) };
    });

  const myActive = variant ? active.filter((x) => x.variant === variant) : active;
  const mySales = variant ? sales.filter((x) => x.variant === variant) : sales;

  const years: YearRow[] = [];
  for (let year = watch.yearMin; year <= watch.yearMax; year++) {
    const l = myActive.filter((x) => x.year === year);
    const s = mySales.filter((x) => x.year === year);
    years.push({
      year,
      listed: l.length,
      medianAsk: median(prices(l)),
      medianKm: median(l.flatMap((x) => (x.km == null ? [] : [x.km]))),
      sales: s.length,
      medianSold: median(prices(s)),
    });
  }

  const recentSales = mySales.filter((x) => x.soldDate >= daysAgo(91));
  const priorSales = mySales.filter((x) => x.soldDate < daysAgo(91) && x.soldDate >= daysAgo(182));
  const recent = median(prices(recentSales));
  const prior = median(prices(priorSales));

  // Price cuts: listings whose latest price, set in the last 30 days, is
  // below the one before it.
  const ids = myActive.map((l) => l.id);
  const snaps = ids.length
    ? await db.select().from(priceSnapshots).where(inArray(priceSnapshots.listingId, ids))
    : [];
  const byListing = new Map<number, typeof snaps>();
  for (const s of snaps) byListing.set(s.listingId, [...(byListing.get(s.listingId) ?? []), s]);
  const cuts: number[] = [];
  for (const list of byListing.values()) {
    const sorted = list.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const latest = sorted.at(-1)!;
    const before = sorted.at(-2);
    if (before && latest.date >= daysAgo(30) && latest.price < before.price) {
      cuts.push(1 - latest.price / before.price);
    }
  }

  const askNow = median(prices(myActive));
  return {
    variants,
    years,
    momentum: {
      recent,
      recentCount: recentSales.length,
      prior,
      priorCount: priorSales.length,
      change: recent != null && prior ? recent / prior - 1 : null,
    },
    priceCuts: { cut: cuts.length, of: myActive.length, medianCut: cuts.length ? median(cuts.map((c) => Math.round(c * 10000)))! / 10000 : null },
    askVsSold: { ask: askNow, sold: recent, gap: gapOf(askNow, recent) },
  };
}

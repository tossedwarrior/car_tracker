import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { listings, type Currency } from "@/db/schema";
import { getMarketHistory, type TrendLabel } from "@/jobs/market";
import { formatYears, watchTitle } from "./format";
import type { Rates } from "./fx";
import { getCarImages, type CarImages } from "./images";
import { showMoney, type Shown } from "./money";
import { listWatches } from "./watchlist";

/** "New" listings on the home page: first seen in the last week. */
const NEW_DAYS = 7;

export interface HomeCar {
  id: number;
  title: string;
  years: string;
  forSale: number;
  newListings: number;
  lowest: Shown | null;
  trend: { label: TrendLabel; change: number } | null;
  images: CarImages;
}

/** Everything the home page shows for each watched car, in watchlist order. */
export function getHomeCars(rates: Rates, display: Currency, now = new Date()): HomeCar[] {
  const since = new Date(now.getTime() - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
  return listWatches().map((w) => {
    const newListings = db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.watchId, w.id), eq(listings.status, "active"), gte(listings.firstSeen, since)))
      .all().length;
    const lowest =
      w.lowest
        .map((l) => showMoney(rates, display, l.price, l.currency))
        .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity))[0] ?? null;
    const { trend } = getMarketHistory(w, rates, now);
    return {
      id: w.id,
      title: watchTitle(w),
      years: formatYears(w.yearMin, w.yearMax).replace("–", " - "),
      forSale: w.activeCount,
      newListings,
      lowest,
      trend: trend.label && trend.change != null ? { label: trend.label, change: trend.change } : null,
      images: getCarImages(w.id),
    };
  });
}

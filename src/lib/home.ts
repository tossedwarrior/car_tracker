import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, type Currency } from "@/db/schema";
import { getMarketHistory, type TrendLabel } from "@/jobs/market";
import { formatYears, watchTitle } from "./format";
import type { Rates } from "./fx";
import { getCarImages, type CarImages } from "./images";
import { showMoney, type Shown } from "./money";
import { outlineFor, type Outline } from "./outlines";
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
  /** No photo yet: a body-style outline to drive instead. */
  outline: Outline | null;
}

/** Everything the home page shows for each car someone follows, in watchlist order. */
export async function getHomeCars(
  userId: number,
  rates: Rates,
  display: Currency,
  now = new Date(),
): Promise<HomeCar[]> {
  const since = new Date(now.getTime() - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const cars: HomeCar[] = [];
  for (const w of await listWatches(userId)) {
    const [{ n: newListings }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(listings)
      .where(and(eq(listings.watchId, w.id), eq(listings.status, "active"), gte(listings.firstSeen, since)));
    const lowest =
      w.lowest
        .map((l) => showMoney(rates, display, l.price, l.currency))
        .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity))[0] ?? null;
    const { trend } = await getMarketHistory(w, rates, now);
    const images = await getCarImages(w.id);
    cars.push({
      id: w.id,
      title: watchTitle(w),
      years: formatYears(w.yearMin, w.yearMax).replace("–", " - "),
      forSale: w.activeCount,
      newListings: Number(newListings),
      lowest,
      trend: trend.label && trend.change != null ? { label: trend.label, change: trend.change } : null,
      images,
      outline: images.photo ? null : outlineFor(w),
    });
  }
  return cars;
}


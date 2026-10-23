import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { soldResults, watchlist } from "@/db/schema";
import { liveContext, soldSources } from "@/sources";
import type { SoldSource, SourceContext } from "@/sources/types";

export type SoldResult = typeof soldResults.$inferSelect;

export interface SoldPullResult {
  found: number;
  added: number;
  calls: number;
  /** The source's own model name, when it differs from the watch's. */
  matchedModel: string | null;
}

/**
 * Pull recent auction results for one watched car and save the new ones.
 * Uses one metered query per sold-results source.
 */
export async function pullSoldResults(
  watchId: number,
  {
    sources = soldSources,
    contextFor = liveContext,
    now = new Date(),
  }: { sources?: SoldSource[]; contextFor?: (s: SoldSource) => SourceContext; now?: Date } = {},
): Promise<SoldPullResult> {
  const watch = db.select().from(watchlist).where(eq(watchlist.id, watchId)).get();
  if (!watch) throw new Error(`No watched car #${watchId}`);

  const total: SoldPullResult = { found: 0, added: 0, calls: 0, matchedModel: null };
  for (const source of sources) {
    const result = await source.search(watch, contextFor(source));
    total.calls += result.calls;
    total.found += result.results.length;
    total.matchedModel ??= result.matchedModel;
    for (const r of result.results) {
      const inserted = db
        .insert(soldResults)
        .values(r)
        .onConflictDoNothing()
        .returning({ id: soldResults.id })
        .get();
      if (inserted) total.added++;
    }
  }

  db.update(watchlist)
    .set({ lastSoldPull: now.toISOString() })
    .where(eq(watchlist.id, watchId))
    .run();
  return total;
}

/** Same model, allowing for shorter source names: "458" matches "458 Italia". */
export function sameModel(watchModel: string, soldModel: string | null): boolean {
  if (!soldModel) return false;
  const a = watchModel.trim().toLowerCase();
  const b = soldModel.trim().toLowerCase();
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

/** Saved auction results for a watched car's make, model and years, newest first. */
export function getSoldResults(watch: {
  make: string;
  model: string;
  yearMin: number;
  yearMax: number;
}): SoldResult[] {
  return db
    .select()
    .from(soldResults)
    .where(
      and(
        sql`lower(${soldResults.make}) = lower(${watch.make})`,
        gte(soldResults.year, watch.yearMin),
        lte(soldResults.year, watch.yearMax),
      ),
    )
    .orderBy(desc(soldResults.soldDate))
    .all()
    .filter((r) => sameModel(watch.model, r.model));
}

/** Middle value; the mean of the two middle values for an even count. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** The p-th percentile (0–100), interpolating between values. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo));
}

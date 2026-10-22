import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { checkRuns, watchlist } from "@/db/schema";
import { watchTitle } from "@/lib/format";
import { liveContext, listingSources } from "@/sources";
import { BudgetExceededError, type ListingSource, type SourceContext } from "@/sources/types";
import { getUsage } from "@/sources/usage";
import { callsPerWatch, localDate } from "./budget";
import { recordListings, type IngestStats } from "./ingest";

export interface RefreshOptions {
  /** Only these watched cars. Default: every active one. */
  watchIds?: number[];
  now?: Date;
  sources?: ListingSource[];
  /** How each source reaches its API. Tests swap in saved responses. */
  contextFor?: (source: ListingSource) => SourceContext;
}

export interface RefreshResult {
  runId: number;
  status: "ok" | "partial" | "failed";
  log: string[];
  calls: number;
}

/**
 * Refresh listings on request: search each source for the chosen watched
 * cars and save what comes back. Records the run in check_runs.
 */
export async function runRefresh({
  watchIds,
  now = new Date(),
  sources = listingSources,
  contextFor = liveContext,
}: RefreshOptions = {}): Promise<RefreshResult> {
  const date = localDate(now);
  const log: string[] = [];
  let problems = 0;
  let calls = 0;
  let sourcesRun = 0;

  const run = db
    .insert(checkRuns)
    .values({ startedAt: now.toISOString() })
    .returning({ id: checkRuns.id })
    .get();

  const watches = db
    .select()
    .from(watchlist)
    .where(
      watchIds
        ? and(eq(watchlist.active, true), inArray(watchlist.id, watchIds))
        : eq(watchlist.active, true),
    )
    .all();
  if (watches.length === 0) log.push("No active watched cars.");
  const refreshed = new Set<number>();

  for (const source of watches.length ? sources : []) {
    let ctx: SourceContext;
    try {
      ctx = contextFor(source);
    } catch (e) {
      // A source without a key is just not set up yet, not a failure.
      log.push(`${source.label}: skipped, ${(e as Error).message}.`);
      continue;
    }
    sourcesRun++;

    const maxCalls = callsPerWatch({
      ...source.callsPerWatch,
      limit: source.monthlyCallLimit,
      used: getUsage(source.id),
      watchCount: watches.length,
    });
    log.push(`${source.label}: up to ${maxCalls} call(s) per car.`);

    for (const watch of watches) {
      const name = watchTitle(watch);
      try {
        const result = await source.search(watch, ctx, { maxCalls });
        calls += result.calls;
        const stats = recordListings({
          watchId: watch.id,
          source: source.id,
          found: result.listings,
          date,
          complete: !result.truncated,
        });
        refreshed.add(watch.id);
        log.push(`  ${name}: ${describe(stats, result)}`);
      } catch (e) {
        problems++;
        if (e instanceof BudgetExceededError) {
          log.push(`  ${name}: stopped, ${e.message}.`);
          break;
        }
        log.push(`  ${name}: failed, ${(e as Error).message}`);
      }
    }
  }

  const finishedAt = new Date().toISOString();
  if (refreshed.size) {
    db.update(watchlist)
      .set({ lastRefreshed: finishedAt })
      .where(inArray(watchlist.id, [...refreshed]))
      .run();
  }
  const status =
    problems > 0 ? (calls > 0 ? "partial" : "failed") : sourcesRun > 0 || !watches.length ? "ok" : "failed";
  db.update(checkRuns)
    .set({ finishedAt, status, log: log.join("\n") })
    .where(eq(checkRuns.id, run.id))
    .run();

  return { runId: run.id, status, log, calls };
}

/** Most API calls a refresh of `watchCount` cars could use, across sources with keys. */
export function maxRefreshCalls(watchCount: number): number {
  return listingSources
    .filter((s) => process.env[s.apiKeyEnv])
    .reduce(
      (n, s) =>
        n +
        watchCount *
          callsPerWatch({ ...s.callsPerWatch, limit: s.monthlyCallLimit, used: getUsage(s.id), watchCount }),
      0,
    );
}

function describe(
  s: IngestStats,
  r: { listings: unknown[]; calls: number; truncated: boolean; total: number | null },
): string {
  const parts = [`${r.listings.length} found`];
  if (r.total != null && r.total !== r.listings.length) parts.push(`source reported ${r.total}`);
  if (s.added) parts.push(`${s.added} new`);
  if (s.priceDrops) parts.push(`${s.priceDrops} price drop(s)`);
  if (s.priceRises) parts.push(`${s.priceRises} price rise(s)`);
  if (s.returned) parts.push(`${s.returned} back on sale`);
  if (s.matchedByVin) parts.push(`${s.matchedByVin} also on another source`);
  if (s.missed) parts.push(`${s.missed} missing`);
  if (s.gone) parts.push(`${s.gone} marked gone`);
  parts.push(`${r.calls} call(s)`);
  if (r.truncated) parts.push("more pages not fetched, so missing cars aren't counted");
  return parts.join(", ") + ".";
}

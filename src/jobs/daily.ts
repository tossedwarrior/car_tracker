import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checkRuns, watchlist } from "@/db/schema";
import { watchTitle } from "@/lib/format";
import { liveContext, listingSources } from "@/sources";
import type { ListingSource, SourceContext } from "@/sources/types";
import { BudgetExceededError, getUsage } from "@/sources/usage";
import { isDue, localDate, pagesPerWatch } from "./budget";
import { recordListings, type IngestStats } from "./ingest";

export interface DailyCheckOptions {
  now?: Date;
  sources?: ListingSource[];
  /** How each source reaches its API. Tests swap in saved responses. */
  contextFor?: (source: ListingSource) => SourceContext;
  /** Run every source, even ones not due today. */
  allSources?: boolean;
}

export interface DailyCheckResult {
  runId: number;
  status: "ok" | "partial" | "failed";
  log: string[];
  calls: number;
}

/**
 * The daily check: for each source that's due, search every active watched
 * car and save what comes back. Records the run in check_runs.
 */
export async function runDailyCheck({
  now = new Date(),
  sources = listingSources,
  contextFor = liveContext,
  allSources = false,
}: DailyCheckOptions = {}): Promise<DailyCheckResult> {
  const date = localDate(now);
  const log: string[] = [];
  let problems = 0;
  let calls = 0;

  const run = db
    .insert(checkRuns)
    .values({ startedAt: now.toISOString() })
    .returning({ id: checkRuns.id })
    .get();

  const watches = db.select().from(watchlist).where(eq(watchlist.active, true)).all();
  if (watches.length === 0) log.push("No active watched cars.");

  for (const source of watches.length ? sources : []) {
    if (!allSources && !isDue(source.everyDays, now)) {
      log.push(`${source.label}: not due today (runs every ${source.everyDays} days).`);
      continue;
    }

    let ctx: SourceContext;
    try {
      ctx = contextFor(source);
    } catch (e) {
      log.push(`${source.label}: skipped, ${(e as Error).message}.`);
      problems++;
      continue;
    }

    const maxPages = pagesPerWatch({
      limit: source.monthlyCallLimit,
      used: getUsage(source.id),
      watchCount: watches.length,
      everyDays: source.everyDays,
      now,
    });
    log.push(`${source.label}: up to ${maxPages} page(s) per car.`);

    for (const watch of watches) {
      const name = watchTitle(watch);
      try {
        const result = await source.search(watch, ctx, { maxPages });
        calls += result.calls;
        const stats = recordListings({
          watchId: watch.id,
          source: source.id,
          found: result.listings,
          date,
          complete: !result.truncated,
        });
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

  const status = problems === 0 ? "ok" : calls > 0 ? "partial" : "failed";
  db.update(checkRuns)
    .set({ finishedAt: new Date().toISOString(), status, log: log.join("\n") })
    .where(eq(checkRuns.id, run.id))
    .run();

  return { runId: run.id, status, log, calls };
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

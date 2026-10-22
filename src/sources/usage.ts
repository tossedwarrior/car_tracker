import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiUsage } from "@/db/schema";
import { BudgetExceededError } from "./types";

export { BudgetExceededError };

/** Current month as YYYY-MM (UTC). */
export const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);

export function getUsage(source: string, month = monthKey()): number {
  const row = db
    .select({ calls: apiUsage.calls })
    .from(apiUsage)
    .where(and(eq(apiUsage.source, source), eq(apiUsage.month, month)))
    .get();
  return row?.calls ?? 0;
}

export function getAllUsage(month = monthKey()) {
  return db.select().from(apiUsage).where(eq(apiUsage.month, month)).all();
}

/**
 * Count one API call against a source's monthly limit, or throw if it would
 * go past it. Counted before the call is made, so a failed call still counts
 * (providers usually bill those too).
 */
export function reserveCall(source: string, limit: number, month = monthKey()) {
  db.transaction((tx) => {
    const row = tx
      .select({ calls: apiUsage.calls })
      .from(apiUsage)
      .where(and(eq(apiUsage.source, source), eq(apiUsage.month, month)))
      .get();
    const used = row?.calls ?? 0;
    if (used >= limit) throw new BudgetExceededError(source, used, limit);
    tx.insert(apiUsage)
      .values({ source, month, calls: 1 })
      .onConflictDoUpdate({
        target: [apiUsage.source, apiUsage.month],
        set: { calls: sql`${apiUsage.calls} + 1` },
      })
      .run();
  });
}

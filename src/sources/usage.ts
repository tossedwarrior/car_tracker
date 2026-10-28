import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiUsage } from "@/db/schema";
import { BudgetExceededError } from "./types";

export { BudgetExceededError };

/** Current month as YYYY-MM (UTC). */
export const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);

export async function getUsage(source: string, month = monthKey()): Promise<number> {
  const [row] = await db
    .select({ calls: apiUsage.calls })
    .from(apiUsage)
    .where(and(eq(apiUsage.source, source), eq(apiUsage.month, month)))
    .limit(1);
  return row?.calls ?? 0;
}

export function getAllUsage(month = monthKey()) {
  return db.select().from(apiUsage).where(eq(apiUsage.month, month));
}

/**
 * Count one API call against a source's monthly limit, or throw if it would
 * go past it. Counted before the call is made, so a failed call still counts
 * (providers usually bill those too).
 */
export async function reserveCall(source: string, limit: number, month = monthKey()) {
  await db.transaction(async (tx) => {
    // Locks the row, so two calls at once can't both take the last one.
    const [row] = await tx
      .select({ calls: apiUsage.calls })
      .from(apiUsage)
      .where(and(eq(apiUsage.source, source), eq(apiUsage.month, month)))
      .for("update");
    const used = row?.calls ?? 0;
    if (used >= limit) throw new BudgetExceededError(source, used, limit);
    await tx
      .insert(apiUsage)
      .values({ source, month, calls: 1 })
      .onDuplicateKeyUpdate({ set: { calls: sql`${apiUsage.calls} + 1` } });
  });
}

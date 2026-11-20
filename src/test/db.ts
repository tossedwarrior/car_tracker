import { eq } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "@/db";
import { follows, users, watchlist } from "@/db/schema";

/** Insert one row and read it back whole (MySQL can't return it from the insert). */
export async function insertRow<T extends MySqlTable & { id: MySqlColumn }>(
  table: T,
  values: T["$inferInsert"],
): Promise<T["$inferSelect"]> {
  const [result] = await db.insert(table).values(values as never);
  const [row] = await db
    .select()
    .from(table as MySqlTable)
    .where(eq(table.id, result.insertId));
  return row as T["$inferSelect"];
}

let nextEmail = 0;

/** A new account (a fresh address each time unless given). */
export async function makeUser(values: Partial<typeof users.$inferInsert> = {}) {
  return insertRow(users, { email: `person${++nextEmail}@example.com`, ...values });
}

/** A car search followed by one person (a new account unless given), with their target. */
export async function followedWatch({
  userId,
  targetPrice = null,
  targetCurrency = "CAD",
}: { userId?: number; targetPrice?: number | null; targetCurrency?: "CAD" | "USD" } = {}) {
  const user = userId ?? (await makeUser()).id;
  const watch = await insertRow(watchlist, { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015 });
  await db.insert(follows).values({ userId: user, watchId: watch.id, targetPrice, targetCurrency });
  return { userId: user, watchId: watch.id };
}

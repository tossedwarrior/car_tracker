import { eq } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "@/db";

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

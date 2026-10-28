import { sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql, { type ResultSetHeader } from "mysql2/promise";
import { connectionOptions } from "../../scripts/db-config.cjs";
import * as schema from "./schema";

type Db = MySql2Database<typeof schema>;

// Reuse one connection pool across Next.js dev-server hot reloads.
const globalForDb = globalThis as unknown as { pool?: mysql.Pool; db?: Db };

function open(): Db {
  if (globalForDb.db) return globalForDb.db;
  const pool = mysql.createPool({
    ...connectionOptions(),
    connectionLimit: 5,
    charset: "utf8mb4",
    // Count only rows that changed, so wasInserted() can tell a new row from a kept one.
    flags: ["-FOUND_ROWS"],
  });
  globalForDb.pool = pool;
  globalForDb.db = drizzle(pool, { schema, mode: "default" });
  return globalForDb.db;
}

/**
 * The database, connected on first use rather than on import, so `next build`
 * (which imports every page) needs no database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    const real = open();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * MySQL's stand-in for "on conflict do nothing": with
 * `.onDuplicateKeyUpdate(ignoreDuplicate)`, a row that already exists is
 * left as it is.
 */
export const ignoreDuplicate = { set: { id: sql`id` } };

/** After an insert with ignoreDuplicate: whether a new row went in. */
export const wasInserted = ([result]: [ResultSetHeader, ...unknown[]]) => result.affectedRows === 1;

/** Close the pool, so scripts and tests can exit. */
export async function closeDb() {
  await globalForDb.pool?.end();
  globalForDb.pool = undefined;
  globalForDb.db = undefined;
}

export { schema };

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

// Reuse one connection across Next.js dev-server hot reloads.
const globalForDb = globalThis as unknown as { sqlite?: Database.Database; db?: Db };

function open(): Db {
  if (globalForDb.db) return globalForDb.db;
  const dbPath = process.env.DATABASE_PATH ?? "./data/tracker.db";
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalForDb.sqlite = sqlite;
  globalForDb.db = drizzle(sqlite, { schema });
  return globalForDb.db;
}

/**
 * The database, opened on first use rather than on import. `next build`
 * imports every page from several workers at once without reading any data;
 * opening the file there made them fight over it ("database is locked").
 */
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    const real = open();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export { schema };

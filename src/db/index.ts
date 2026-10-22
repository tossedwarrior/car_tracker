import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "./data/tracker.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Reuse one connection across Next.js dev-server hot reloads.
const globalForDb = globalThis as unknown as { sqlite?: Database.Database };
const sqlite = globalForDb.sqlite ?? new Database(dbPath);
if (!globalForDb.sqlite) {
  // Wait for another process instead of failing with "database is locked":
  // `next build` opens the database from several workers at once.
  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalForDb.sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };

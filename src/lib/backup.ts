import { getTableColumns, type InferInsertModel } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "@/db";
import {
  alertsSent,
  apiUsage,
  checkRuns,
  fxRates,
  listings,
  marketSnapshots,
  priceSnapshots,
  soldResults,
  watchImages,
  watchlist,
} from "@/db/schema";

// Backup & restore: the whole database (photos and logos included) as one
// gzipped JSON file. Settings downloads and restores it; it's also how data
// moves between the Mac and the live site, which each have their own MySQL.

const FORMAT = 1;

/** Every table, parents before the tables that point at them. */
export const BACKUP_TABLES = {
  watchlist,
  listings,
  priceSnapshots,
  soldResults,
  marketSnapshots,
  alertsSent,
  apiUsage,
  fxRates,
  checkRuns,
  watchImages,
} satisfies Record<string, MySqlTable>;

type TableName = keyof typeof BACKUP_TABLES;
type Rows = Record<string, unknown>[];

export interface BackupFile {
  app: "poster-wall";
  format: number;
  createdAt: string;
  tables: Partial<Record<TableName, Rows>>;
}

export type BackupCounts = Record<TableName, number>;

// JSON has no bytes; images go in as { $base64 } and come back as Buffers.
const encode = (_: string, v: unknown) =>
  v && typeof v === "object" && (v as { type?: string }).type === "Buffer" && Array.isArray((v as { data?: unknown }).data)
    ? { $base64: Buffer.from((v as { data: number[] }).data).toString("base64") }
    : v;
const decode = (_: string, v: unknown) =>
  v && typeof v === "object" && typeof (v as { $base64?: unknown }).$base64 === "string"
    ? Buffer.from((v as { $base64: string }).$base64, "base64")
    : v;

/** A backup file's bytes from its contents. */
export function packBackup(tables: BackupFile["tables"], now = new Date()): Buffer {
  const file: BackupFile = { app: "poster-wall", format: FORMAT, createdAt: now.toISOString(), tables };
  return gzipSync(JSON.stringify(file, encode));
}

/** A backup file's contents, or throws saying what's wrong with it. */
export function unpackBackup(bytes: Buffer): BackupFile {
  let text: string;
  try {
    text = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8");
  } catch {
    throw new Error("That file isn't a Poster Wall backup.");
  }
  let file: BackupFile;
  try {
    file = JSON.parse(text, decode);
  } catch {
    throw new Error("That file isn't a Poster Wall backup.");
  }
  if (file?.app !== "poster-wall" || typeof file.tables !== "object") {
    throw new Error("That file isn't a Poster Wall backup.");
  }
  if (file.format > FORMAT) throw new Error("That backup is from a newer version of the app. Update this one first.");
  return file;
}

/** The whole database, as a backup file's bytes. */
export async function createBackup(now = new Date()): Promise<Buffer> {
  const tables: BackupFile["tables"] = {};
  for (const [name, table] of Object.entries(BACKUP_TABLES) as [TableName, MySqlTable][]) {
    tables[name] = (await db.select().from(table)) as Rows;
  }
  return packBackup(tables, now);
}

/** Keep only the table's own columns, so an older or newer backup still loads. */
function clean(table: MySqlTable, rows: Rows): Rows {
  const keys = Object.keys(getTableColumns(table));
  return rows.map((r) => Object.fromEntries(keys.filter((k) => k in r).map((k) => [k, r[k]])));
}

/**
 * Replace everything in the database with a backup's contents, all or
 * nothing: if any of it fails, the database is left as it was.
 */
export async function restoreBackup(bytes: Buffer): Promise<BackupCounts> {
  const file = unpackBackup(bytes);
  const entries = Object.entries(BACKUP_TABLES) as [TableName, MySqlTable][];
  const counts = Object.fromEntries(entries.map(([n]) => [n, 0])) as BackupCounts;

  await db.transaction(async (tx) => {
    for (const [, table] of [...entries].reverse()) await tx.delete(table);
    for (const [name, table] of entries) {
      const rows = clean(table, file.tables[name] ?? []);
      // Images go one at a time (each can be megabytes); the rest in batches.
      const size = table === watchImages ? 1 : 200;
      for (let i = 0; i < rows.length; i += size) {
        await tx.insert(table).values(rows.slice(i, i + size) as InferInsertModel<typeof table>[]);
      }
      counts[name] = rows.length;
    }
  });
  return counts;
}

/** "3 cars, 412 listings, 4 images", for messages. */
export function describeCounts(c: BackupCounts): string {
  const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-CA")} ${count === 1 ? one : many}`;
  return [
    n(c.watchlist, "car"),
    n(c.listings, "listing"),
    n(c.soldResults, "auction result"),
    n(c.watchImages, "photo or logo", "photos and logos"),
  ].join(", ");
}

export const backupFileName = (now = new Date()) => `poster-wall-backup-${now.toISOString().slice(0, 10)}.json.gz`;

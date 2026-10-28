// Turn the old SQLite database (before the move to MySQL) into a backup
// file, to restore here (npm run backup:restore) or on the live site
// (Settings → Backup & restore). Reads only; the old file isn't changed.
//
//   npm run backup:from-sqlite                       # data/tracker.db
//   npm run backup:from-sqlite -- path/to/tracker.db
import Database from "better-sqlite3";
import { getTableColumns } from "drizzle-orm";
import fs from "node:fs";
import { BACKUP_TABLES, backupFileName, packBackup, type BackupFile } from "@/lib/backup";

const source = process.argv[2] ?? "data/tracker.db";
if (!fs.existsSync(source)) {
  console.error(`No SQLite database at ${source}.`);
  process.exit(1);
}
const sqlite = new Database(source, { readonly: true });
const hasTable = (name: string) =>
  !!sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name);

const tables: BackupFile["tables"] = {};
for (const [name, table] of Object.entries(BACKUP_TABLES)) {
  const columns = Object.entries(getTableColumns(table));
  const sqlName = (table as unknown as { [k: symbol]: string })[Symbol.for("drizzle:Name")];
  if (!hasTable(sqlName)) continue;
  const rows = sqlite.prepare(`select * from "${sqlName}"`).all() as Record<string, unknown>[];
  // SQLite rows use column names (first_seen) and 0/1 for booleans; the
  // backup uses the app's field names (firstSeen) and true/false.
  tables[name as keyof typeof BACKUP_TABLES] = rows.map((r) =>
    Object.fromEntries(
      columns
        .filter(([, col]) => col.name in r)
        .map(([key, col]) => [key, col.columnType === "MySqlBoolean" ? Boolean(r[col.name]) : r[col.name]]),
    ),
  );
  console.log(`${name}: ${rows.length}`);
}
sqlite.close();

const out = `data/${backupFileName().replace("backup", "backup-from-sqlite")}`;
fs.writeFileSync(out, packBackup(tables));
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB).`);

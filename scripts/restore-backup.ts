// Replace everything in the database (DATABASE_URL in .env) with a backup
// file's contents, like Settings → Backup & restore does.
//
//   npm run backup:restore -- data/poster-wall-backup-2026-10-27.json.gz
import "dotenv/config";
import fs from "node:fs";
import { closeDb } from "@/db";
import { describeCounts, restoreBackup } from "@/lib/backup";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Usage: npm run backup:restore -- <backup file>");
  process.exit(1);
}
try {
  const counts = await restoreBackup(fs.readFileSync(file));
  console.log(`Restored ${describeCounts(counts)}.`);
} finally {
  await closeDb();
}

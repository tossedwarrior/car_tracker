// Startup file for hosting with cPanel's "Setup Node.js App" (Passenger).
// Set it as the application's startup file. Needs `npm install` and
// `npm run build` first. CommonJS (.cjs) so any Node loader can run it.
//
// On start: creates or updates the database tables (DATABASE_PATH), then
// serves the built app on the port Passenger gives it.

const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("node:http");

process.env.NODE_ENV = "production";
const dir = __dirname;

// Database tables, from the migrations in drizzle/.
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");

const dbPath = path.resolve(dir, process.env.DATABASE_PATH || "data/tracker.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
migrate(drizzle(sqlite), { migrationsFolder: path.join(dir, "drizzle") });
sqlite.close();

if (!fs.existsSync(path.join(dir, ".next", "BUILD_ID"))) {
  console.error("No build found. Run `npm run build` (cPanel: Run JS script → build), then restart.");
  process.exit(1);
}

const next = require("next");
const app = next({ dev: false, dir });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const port = Number(process.env.PORT) || 3000;
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Car Price Tracker ready on port ${port}, database ${dbPath}`);
  });
});

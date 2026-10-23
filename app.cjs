// Production startup. `npm start` runs it, and it can also be the startup
// file in cPanel's "Setup Node.js App". CommonJS (.cjs) so any Node loader
// can run it.
//
// On start it makes sure the app can run, whatever the host shipped:
//   1. installs dependencies if they're missing;
//   2. builds the app if there's no build, or the build is from older code
//      (hosts can leave a previous version's files behind);
//   3. creates or updates the database tables (DATABASE_PATH);
// then serves the app on the host's PORT.

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("node:http");

const dir = __dirname;
const run = (command) => execSync(command, { cwd: dir, stdio: "inherit" });

if (!fs.existsSync(path.join(dir, "node_modules", "next", "package.json"))) {
  console.log("No dependencies found; installing them (npm ci)…");
  // The build needs the dev tools (TypeScript), even with NODE_ENV=production.
  run("npm ci --include=dev");
}

const stamp = require("./scripts/build-stamp.cjs");
if (!stamp.isCurrent()) {
  console.log("No build of this version found; building it…");
  run("npx next build");
  stamp.write();
}

process.env.NODE_ENV = "production";

// Database tables, from the migrations in drizzle/.
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");

const dbPath = path.resolve(dir, process.env.DATABASE_PATH || "data/tracker.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
migrate(drizzle(sqlite), { migrationsFolder: path.join(dir, "drizzle") });
sqlite.close();

const next = require("next");
const app = next({ dev: false, dir });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const port = Number(process.env.PORT) || 3000;
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Car Price Tracker ready on port ${port}, database ${dbPath}`);
  });
});

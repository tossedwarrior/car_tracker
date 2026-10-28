// Production startup. `npm start` runs it, and it can also be the startup
// file in cPanel's "Setup Node.js App". CommonJS (.cjs) so any Node loader
// can run it.
//
// On start it makes sure the app can run, whatever the host shipped:
//   1. installs dependencies if they're missing;
//   2. builds the app if there's no build, or the build is from older code
//      (hosts can leave a previous version's files behind);
//   3. creates or updates the database tables in MySQL (see
//      scripts/db-config.cjs for the variables it reads);
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

async function main() {
  // Database tables, from the migrations in drizzle/.
  const mysql = require("mysql2/promise");
  const { drizzle } = require("drizzle-orm/mysql2");
  const { migrate } = require("drizzle-orm/mysql2/migrator");
  const dbConfig = require("./scripts/db-config.cjs");

  const options = dbConfig.connectionOptions();
  const connection = await mysql.createConnection(options);
  await migrate(drizzle(connection), { migrationsFolder: path.join(dir, "drizzle") });
  await connection.end();

  const next = require("next");
  const app = next({ dev: false, dir });
  const handle = app.getRequestHandler();
  await app.prepare();

  const port = Number(process.env.PORT) || 3000;
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Poster Wall ready on port ${port}, database ${dbConfig.describe(options)}`);
  });
}

main().catch((e) => {
  console.error(`Poster Wall didn't start: ${e.message}`);
  process.exit(1);
});

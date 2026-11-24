import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeEach } from "vitest";
import { closeDb, db } from "@/db";
import { setCustomerioForTests } from "@/lib/customerio";
import { connectionOptions, toUrl } from "../../scripts/db-config.cjs";

// Every test file starts with an empty database of its own, on the local
// MySQL server (TEST_DATABASE_URL in .env; never the app's own database).
// Test files run side by side, so each worker gets its own copy.

const base = connectionOptions({ DATABASE_URL: process.env.TEST_DATABASE_URL });
const database = `${base.database}_${process.env.VITEST_POOL_ID ?? "0"}`;

const admin = await mysql.createConnection({ ...base, database: undefined });
await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
await admin.end();

process.env.DATABASE_URL = toUrl({ ...base, database });
await migrate(db, { migrationsFolder: "drizzle" });

afterAll(closeDb);

// Never send anything to a real Customer.io workspace from tests, even with
// keys in .env. Tests that check what's sent swap in a fake client.
// Same for CarsXE: tests that look up photos stub the key and the requests.
for (const name of Object.keys(process.env)) {
  if (name.includes("CUSTOMERIO") || name.startsWith("CARSXE")) delete process.env[name];
}
beforeEach(() => setCustomerioForTests(null));

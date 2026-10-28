import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { connectionOptions, toUrl } from "./scripts/db-config.cjs";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: toUrl(connectionOptions()) },
});

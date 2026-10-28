import { parse } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// TEST_DATABASE_URL from .env, when there is one. Read with dotenv, not
// vite's loadEnv: vite is only a peer dependency of vitest, and GoDaddy's
// install skips those (its build type-checks this file too).
const env = fs.existsSync(".env") ? parse(fs.readFileSync(".env")) : {};

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    // Tests use their own databases on the local MySQL server (see
    // src/test/setup.ts), never the app's.
    env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL ?? "", DATABASE_URL: "" },
    setupFiles: ["./src/test/setup.ts"],
  },
});

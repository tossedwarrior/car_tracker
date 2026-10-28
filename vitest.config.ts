import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const { TEST_DATABASE_URL } = loadEnv("test", process.cwd(), "TEST_");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    // Tests use their own databases on the local MySQL server (see
    // src/test/setup.ts), never the app's.
    env: { TEST_DATABASE_URL: TEST_DATABASE_URL ?? "", DATABASE_URL: "" },
    setupFiles: ["./src/test/setup.ts"],
  },
});

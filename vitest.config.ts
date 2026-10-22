import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    // Tests get a fresh in-memory database, never data/tracker.db.
    env: { DATABASE_PATH: ":memory:" },
    setupFiles: ["./src/test/setup.ts"],
  },
});

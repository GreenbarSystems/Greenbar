import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests require a live Postgres with the RLS migration applied.
// They are SKIPPED automatically when INTEGRATION_DATABASE_URL is unset, so
// `npm run test:integration` is safe to run anywhere.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false, // share one DB; avoid cross-test interference
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

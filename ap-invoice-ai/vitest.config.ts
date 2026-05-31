import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    // Unit + guardrail tests (no live DB). Integration tests that need Postgres
    // live under test/integration and run via vitest.integration.config.ts.
    include: ["src/**/*.test.ts", "test/guardrails/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

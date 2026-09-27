import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Opt-in live checks against real providers. Never part of `pnpm test`: they
 * need credentials, touch production APIs (read-only) and are slow by design
 * because ShopifyQL is budgeted per minute. Standalone rather than merged with
 * vitest.config.ts, whose `include` would otherwise be concatenated in.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test-support/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 15 * 60_000,
    hookTimeout: 15 * 60_000,
    fileParallelism: false,
  },
});

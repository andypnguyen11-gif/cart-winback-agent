import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * `npm run eval:live`. Real Anthropic calls, real money (cents). Reads
 * ANTHROPIC_API_KEY from the environment or .env.local. Kept out of `npm test`.
 */
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    include: ["evals/live/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./evals/live/setup.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    reporters: ["verbose"],
  },
  resolve: { alias: { "@": root } },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    include: ["evals/**/*.test.ts", "lib/**/*.test.ts", "components/**/*.test.tsx"],
    exclude: ["evals/live/**", "node_modules/**", ".next/**"],
    environment: "node",
  },
  resolve: {
    alias: { "@": root },
  },
});

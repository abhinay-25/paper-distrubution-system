import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Always resolve from the backend directory regardless of cwd.
    root: path.resolve(import.meta.dirname),
    include: ["src/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/__generated__/**"],
    },
  },
});

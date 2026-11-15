import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/actions/**", "src/components/**", "src/proxy.ts"],
      exclude: ["src/lib/db.ts", "src/lib/session.ts", "src/lib/email.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});

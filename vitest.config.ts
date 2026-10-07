import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./TestSetup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [...configDefaults.exclude, "examples/ruian-preview/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "./coverage",

      // Scoped to the logic this project is responsible for. `app/` is Next
      // routing and layout, and `components/` is presentation covered by
      // component tests where it carries behaviour — including them would
      // inflate the denominator with files whose coverage says nothing about
      // whether the trust boundary holds.
      include: [
        "domain/**/*.ts",
        "infra/**/*.ts",
        "application/**/*.ts",
        "presentation/**/*.ts",
        "middleware.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],

      // 80% to match the `code_coverage` rule on the master ruleset, which had
      // been demanding a number this repository did not produce. Measured at
      // 92% statements / 88% functions when this landed, so the threshold is a
      // floor against regression rather than a target being scraped.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});

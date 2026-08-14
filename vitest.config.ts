import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each file resets module state (the retrieval store and the rate limiter
    // are module-level singletons), so files must not share a module registry.
    isolate: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      // lib/types.ts is interfaces only. It compiles to no runtime code, so
      // v8 reports it as 0% covered and drags the totals down for something
      // that has nothing to execute.
      exclude: ["lib/types.ts"],
    },
  },
});

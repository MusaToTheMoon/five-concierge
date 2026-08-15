import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Separate Vitest config for the offline benchmark suite (Tier A and
// Tier C). Kept out of the tests/ directory, so the main vitest.config.ts
// (which only includes files under tests/) never touches these files, and
// `npm test` and CI never run benchmarks.
//
// isolate stays true, matching the main config: each bench file gets its
// own module registry, because the retrieval store cache and the rate
// limiter are module-level singletons that must not leak between files.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["bench/*.bench.ts"],
    isolate: true,
    // Tier C drives hundreds of requests per concurrency level against
    // calibrated (not instant) stub latencies, so a single run can
    // legitimately take several minutes.
    testTimeout: 30 * 60 * 1000,
  },
});

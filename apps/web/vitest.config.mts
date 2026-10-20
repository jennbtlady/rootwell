import { defineConfig } from "vitest/config";

// Unit tests for pure helpers only. Page flows are covered by Playwright (Phase 1).
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});

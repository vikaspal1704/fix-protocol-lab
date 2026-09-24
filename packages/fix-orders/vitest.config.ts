import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { conditions: ["source"] },
  test: { name: "fix-orders", include: ["test/**/*.test.ts"], passWithNoTests: true },
});

import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { conditions: ["source"] },
  test: { name: "fix-core", include: ["test/**/*.test.ts"] },
});

import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { conditions: ["source"] },
  test: { name: "fix-session", include: ["test/**/*.test.ts"] },
});

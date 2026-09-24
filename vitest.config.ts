import { defineConfig } from "vitest/config";

// One Vitest run across all workspaces. Packages resolve to their TypeScript
// sources through the "source" export condition, so tests never need a build.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});

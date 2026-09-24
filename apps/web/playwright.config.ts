import { defineConfig, devices } from "@playwright/test";

const PORT = 8093;
// Use a preinstalled Chromium when one is provided (e.g. PW_CHROMIUM_PATH in sandboxes).
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: "node ../server/dist/main.js",
    url: `http://127.0.0.1:${PORT}/health`,
    env: { PORT: String(PORT), HEARTBEAT_INTERVAL_SEC: "5" },
    reuseExistingServer: false,
  },
});

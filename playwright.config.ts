import { defineConfig } from "@playwright/test";

// Node's own unit tests live beside these as tests/*.test.ts, so Playwright only collects *.spec.ts.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4422", headless: true, channel: "chrome" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 4422",
    url: "http://127.0.0.1:4422",
    reuseExistingServer: false,
  },
});

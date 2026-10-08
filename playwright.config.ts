import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 4422);

// Node's own unit tests live beside these as tests/*.test.ts, so Playwright only collects *.spec.ts.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  reporter: "list",
  workers: Number(process.env.PW_WORKERS ?? 1),
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, channel: "chrome" },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});

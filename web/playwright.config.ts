import { defineConfig } from "@playwright/test";
import path from "node:path";

// Keep screenshot rendering independent from host-only fonts (for example,
// Windows fonts exposed inside WSL). Child web-server and browser processes
// inherit this unless a caller intentionally supplies another font config.
process.env.FONTCONFIG_FILE ??= path.join(__dirname, "e2e/fontconfig/fonts.conf");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3090",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "cd .. && make dev",
    url: "http://127.0.0.1:3090/login",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});

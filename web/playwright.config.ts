import { defineConfig, devices } from "@playwright/test";

const token = process.env.VERCEL_OIDC_TOKEN;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 2,
  reporter: "list",
  use: {
    baseURL: process.env.PREVIEW_URL,
    ...devices["Desktop Chrome"],
    extraHTTPHeaders: token ? { "x-vercel-trusted-oidc-idp-token": token } : {},
  },
});

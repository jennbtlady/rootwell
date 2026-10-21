import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Local runs read apps/web/.env.local for Supabase and database settings.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@phone|@mobile/ },
    { name: "phone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" }, grep: /@phone/ },
    // The mobile browser pass (build plan, Phase 6): every form on Safari's engine at
    // iPhone size and on Chrome at Android size. Run with: pnpm exec playwright test --grep @mobile
    { name: "ios-safari", use: { ...devices["iPhone 13"] }, grep: /@mobile/ },
    { name: "android-chrome", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: ci ? "pnpm exec next start --port 3000" : "pnpm exec next dev --port 3000",
    url: "http://localhost:3000/api/v1/health",
    reuseExistingServer: !ci,
    timeout: 120_000,
    env: { MFA_ENFORCEMENT: "off", SMTP_URL: process.env.SMTP_URL ?? "smtp://127.0.0.1:54325" },
  },
});

import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
export default defineConfig({
  testDir: "tests/ui",
  workers: 1,
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    baseURL: "http://127.0.0.1:4188",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node server/index.mjs",
    url: "http://127.0.0.1:4188",
    reuseExistingServer: false,
    env: {
      PORT: "4188",
      REACH_OUT_DATA_DIR: mkdtempSync(join(tmpdir(), "reach-out-ui-")),
    },
  },
});

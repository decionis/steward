#!/usr/bin/env node

/**
 * Captures the README screenshots from a running instance.
 *
 * Screenshots of a UI go stale silently — the interface changes, the images do
 * not, and the README quietly starts lying. Regenerating them is one command.
 *
 * Usage:
 *   pnpm build && STEWARD_DATA_MODE=demo pnpm start   # in one terminal
 *   pnpm screenshots                              # in another
 *
 * Demo mode is required, not incidental: these images are published, and live
 * mode would put real customer names and processing limits in them.
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.STEWARD_SCREENSHOT_URL ?? "http://localhost:3000";
const OUTPUT_DIR = "docs";

/** 2x for a display-quality image; 1280 keeps the sidebar layout. */
const VIEWPORT = { width: 1280, height: 860 };
const SCALE = 2;

const SHOTS = [
  {
    file: "screenshot-control-center.png",
    path: "/",
    description: "Portfolio summary and evidence coverage",
  },
  {
    file: "screenshot-opportunity-queue.png",
    path: "/",
    description: "The governed action queue with its review controls",
    // Scroll past the summary tiles to the queue itself.
    scrollTo: "#opportunities",
  },
  {
    file: "screenshot-account-detail.png",
    path: "/accounts/acct-kilo",
    description: "Account evidence, policy, and decision timeline",
  },
  {
    file: "screenshot-signal-sources.png",
    path: "/signals",
    description: "The signal sources this deployment collects from",
  },
];

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    // The bundled Chromium download is blocked on some networks. System Chrome
    // renders identically for this purpose and needs no download.
    process.stderr.write(
      `Bundled Chromium unavailable (${error.message.split("\n")[0]}).\n` +
        "Falling back to system Chrome.\n",
    );
    return chromium.launch({ channel: "chrome" });
  }
}

async function assertDemoMode(page) {
  const response = await page.request.get(`${BASE_URL}/api/steward/portfolio`);
  if (!response.ok()) {
    throw new Error(
      `${BASE_URL}/api/steward/portfolio returned ${response.status()}. ` +
        "Is the server running?",
    );
  }
  const body = await response.json();
  if (body.dataStatus !== "DEMO") {
    throw new Error(
      `Refusing to capture: server reports dataStatus=${body.dataStatus}. ` +
        "Screenshots are published — run with STEWARD_DATA_MODE=demo.",
    );
  }
}

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: "light",
  reducedMotion: "reduce",
});
const page = await context.newPage();

try {
  await assertDemoMode(page);
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const shot of SHOTS) {
    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "networkidle" });

    if (shot.scrollTo) {
      await page.evaluate((selector) => {
        document
          .querySelector(selector)
          ?.scrollIntoView({ block: "start", behavior: "instant" });
      }, shot.scrollTo);
      await page.waitForTimeout(300);
    }

    const target = `${OUTPUT_DIR}/${shot.file}`;
    await page.screenshot({ path: target });
    process.stdout.write(`${target}  —  ${shot.description}\n`);
  }
} finally {
  await context.close();
  await browser.close();
}

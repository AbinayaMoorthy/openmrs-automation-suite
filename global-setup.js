/**
 * Global Setup — runs ONCE before the entire suite.
 *
 * Logs in as admin and saves the authenticated session (cookies) to
 * .auth/state.json. Every test context is then created pre-authenticated
 * via `storageState` in playwright.config.js.
 *
 * HARDENED: test3.openmrs.org is a shared QA server that goes down or
 * slows to a crawl regularly (it's rebuilt around release candidates).
 * So we: (1) ping the server first for a clear "server is down" error,
 * (2) retry login up to 3 times, (3) save a screenshot on failure to
 * .auth/setup-failure.png for debugging.
 */
const { chromium, request } = require('@playwright/test');
const { LoginPage } = require('./pages/LoginPage');
const { users } = require('./test-data/testData');
const fs = require('fs');
const path = require('path');

const STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'state.json');
const FAILURE_SCREENSHOT = path.join(__dirname, '.auth', 'setup-failure.png');
const LOGIN_URL = 'https://test3.openmrs.org/openmrs/spa/login';
const MAX_ATTEMPTS = 3;

async function checkServerUp() {
  // ADVISORY ONLY. A plain HTTP client has no browser fingerprint, so
  // bot protection (Cloudflare etc.) may answer 403 even when the site
  // works fine in a real browser. So: 4xx = warn and continue (the real
  // browser attempt below is the actual test). Only 5xx or a dead
  // connection means the server is truly down.
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(LOGIN_URL, { timeout: 30000 });
    const status = res.status();
    if (status >= 500) {
      throw new Error(
        `test3.openmrs.org responded with HTTP ${status}. ` +
        `The shared QA server appears to be DOWN — this is not a problem ` +
        `with your tests. Try again in a while, or check ` +
        `https://talk.openmrs.org for outage/release announcements.`
      );
    }
    if (!res.ok()) {
      console.warn(
        `⚠ Health check got HTTP ${status} — likely bot protection ` +
        `blocking the bare HTTP probe, not a real outage. Proceeding ` +
        `with a real browser login attempt...`
      );
    }
  } catch (err) {
    if (err.message.includes('appears to be DOWN')) throw err;
    // Network-level failure (DNS, refused, timeout) = genuinely unreachable
    throw new Error(
      `Could not reach test3.openmrs.org at all (${err.message}). ` +
      `Check your internet connection, or the server may be down.`
    );
  } finally {
    await ctx.dispose();
  }
}

module.exports = async function globalSetup() {
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });

  // Fail fast with a clear message if the server itself is unreachable
  await checkServerUp();

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Headed, matching playwright.config.js — headless Chrome can trip
    // the same bot protection that 403'd the health check
    const browser = await chromium.launch({ headless: false, channel: 'chrome' });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      console.log(`Global setup: login attempt ${attempt}/${MAX_ATTEMPTS}...`);
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.login(users.admin.username, users.admin.password);

      if (!page.url().includes('/home/')) {
        throw new Error(`Login did not reach dashboard. URL: ${page.url()}`);
      }

      await context.storageState({ path: STORAGE_STATE_PATH });
      console.log(`✔ Auth session saved to ${STORAGE_STATE_PATH}`);
      await browser.close();
      return; // success
    } catch (err) {
      lastError = err;
      console.warn(`✘ Attempt ${attempt} failed: ${err.message}`);
      await page.screenshot({ path: FAILURE_SCREENSHOT, fullPage: true })
        .catch(() => {});
      await browser.close();
      if (attempt < MAX_ATTEMPTS) {
        console.log('Waiting 15s before retry (test3 may be warming up)...');
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  throw new Error(
    `Global setup failed after ${MAX_ATTEMPTS} attempts. ` +
    `Last error: ${lastError.message}\n` +
    `A screenshot of the last failure was saved to ${FAILURE_SCREENSHOT}. ` +
    `If it shows an error page or blank screen, test3.openmrs.org is likely down.`
  );
};

module.exports.STORAGE_STATE_PATH = STORAGE_STATE_PATH;

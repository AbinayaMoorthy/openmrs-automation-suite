/**
 * tools/inspect-patient-search.js
 *
 * Run:  node tools/inspect-patient-search.js
 *
 * WHY THIS EXISTS
 * ---------------
 * TC024 and TC025 currently prove nothing. Both read
 * PatientPage.searchResults, built from class names that were guessed and
 * never confirmed:
 *     '.omrs-search-result, [data-testid*="patient-search"], .patient-search-result-item'
 *
 * If that matches nothing, the count is 0 forever — so TC024 (count >= 0) can
 * never fail, and TC025 (count === 0) passes for the wrong reason.
 *
 * Guessing a replacement is how the bug got here. This script opens the real
 * navbar search, runs both the existing-patient and no-match queries from
 * test-data/testData.js, and dumps the actual DOM around the results so the
 * new locator is based on evidence.
 *
 * Requires .auth/state.json — run `npm test` once first.
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { patients } = require('../test-data/testData');
const { waitForNavbarAction } = require('../utils/appShell');

const STORAGE_STATE = path.join(__dirname, '..', '.auth', 'state.json');
const DASHBOARD_URL = 'https://test3.openmrs.org/openmrs/spa/home/service-queues';

async function dumpResultsFor(page, query, tag) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`QUERY: "${query}"   (${tag})`);
  console.log('='.repeat(70));

  const input = page.locator('input[placeholder*="Search"], input[type="search"]').first();
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await input.fill('');
  await input.fill(query);

  // Generous settle — we are inspecting, not racing.
  await page.waitForTimeout(6000);

  // Cast a deliberately wide net. We do NOT assume any class name here; we
  // look for the structural containers O3 could plausibly be using and report
  // whichever ones actually exist.
  const candidates = [
    '[role="listbox"]',
    '[role="option"]',
    '[role="list"]',
    '[role="listitem"]',
    'li',
    'a[href*="/patient/"]',
    '[class*="result"]',
    '[class*="Result"]',
    '[data-testid]',
    '[class*="search"]',
    '[class*="Search"]',
    '[class*="empty"]',
    '[class*="Empty"]',
  ];

  const found = [];
  for (const sel of candidates) {
    const count = await page.locator(sel).count();
    if (count > 0) found.push({ selector: sel, count });
  }

  console.log('\n-- SELECTOR HIT COUNTS --');
  console.table(found);

  console.log('\n-- CURRENT (BROKEN) LOCATOR --');
  const brokenCount = await page
    .locator('.omrs-search-result, [data-testid*="patient-search"], .patient-search-result-item')
    .count();
  console.log(`matches: ${brokenCount}   <-- if 0 for BOTH queries, confirmed dead`);

  console.log('\n-- ELEMENTS CARRYING data-testid --');
  const testIds = await page.locator('[data-testid]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.getAttribute('data-testid')))].slice(0, 40)
  );
  console.log(testIds);

  console.log('\n-- a[href*="/patient/"] (likely one per result row) --');
  const rows = await page.locator('a[href*="/patient/"]').evaluateAll((els) =>
    els.slice(0, 10).map((e) => ({
      href: e.getAttribute('href'),
      text: (e.textContent || '').trim().slice(0, 80),
      cls: e.getAttribute('class'),
      parentCls: e.parentElement?.getAttribute('class') || null,
      parentRole: e.parentElement?.getAttribute('role') || null,
    }))
  );
  console.log(JSON.stringify(rows, null, 2));

  console.log('\n-- VISIBLE TEXT NEAR THE SEARCH PANEL (empty-state wording lives here) --');
  const panelText = await page
    .locator('[role="listbox"], [class*="search" i], [class*="result" i]')
    .first()
    .textContent()
    .catch(() => null);
  console.log(panelText ? panelText.trim().slice(0, 400) : '(no panel matched)');

  const outHtml = path.join(__dirname, `patient-search-${tag}.html`);
  fs.writeFileSync(outHtml, await page.content());
  await page.screenshot({
    path: path.join(__dirname, `patient-search-${tag}.png`),
    fullPage: true,
  });
  console.log(`\nSaved: tools/patient-search-${tag}.html and .png`);
}

(async () => {
  if (!fs.existsSync(STORAGE_STATE)) {
    console.error(
      `No saved session at ${STORAGE_STATE}.\n` +
      `Run the suite once (npm test) so global-setup can create it, then retry.`
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();

  try {
    console.log('Loading dashboard (O3 cold start — be patient)...');
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    const icon = await waitForNavbarAction(page, 'search');
    console.log('Opening navbar patient search...');
    await icon.click();

    await dumpResultsFor(page, patients.search.existing, 'hits');
    await dumpResultsFor(page, patients.search.nonExistent, 'empty');

    console.log('\n\nBrowser stays open 30s — right-click a result row and');
    console.log('"Inspect" if you want to eyeball the markup yourself.');
    await page.waitForTimeout(30000);
  } catch (err) {
    console.error('\nInspection failed:', err.message);
    await page
      .screenshot({ path: path.join(__dirname, 'inspect-search-failure.png'), fullPage: true })
      .catch(() => {});
  } finally {
    await browser.close();
  }
})();

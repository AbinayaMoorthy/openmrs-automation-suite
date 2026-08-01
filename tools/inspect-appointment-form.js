/**
 * tools/inspect-appointment-form.js
 *
 * Run:  node tools/inspect-appointment-form.js
 *
 * TC036 is the one genuine failure in the suite: the "patient search field"
 * locator matched nothing. I can reason about why (Carbon Search/ComboBox
 * components usually render no placeholder attribute, and the old locator
 * matched on placeholder only) but I cannot see your live DOM from here.
 *
 * This script opens the appointment workspace using your already-saved auth
 * session and prints every form control it contains, with all the attributes
 * a locator could key off. Thirty seconds of this beats another 23-minute
 * suite run guessing.
 *
 * Requires .auth/state.json to exist — run `npm test` once, or run
 * global-setup, to create it.
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const STORAGE_STATE = path.join(__dirname, '..', '.auth', 'state.json');
const APPOINTMENTS_URL = 'https://test3.openmrs.org/openmrs/spa/home/appointments';

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
    console.log('Loading appointments page (O3 cold start — be patient)...');
    await page.goto(APPOINTMENTS_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 90000 });

    const createBtn = page.getByRole('button', { name: 'Create new appointment' });
    await createBtn.waitFor({ state: 'visible', timeout: 60000 });
    console.log('Opening the "Create new appointment" workspace...');
    await createBtn.click();

    const workspace = page
      .locator('[role="dialog"], [role="complementary"], [class*="workspace"], form')
      .first();
    await workspace.waitFor({ state: 'visible', timeout: 30000 });

    // Give any async patient-search extension a moment to mount
    await page.waitForTimeout(4000);

    const controls = await workspace
      .locator('input, select, textarea, [role="combobox"], [role="searchbox"], button')
      .evaluateAll((els) =>
        els.map((el, i) => ({
          index: i,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type'),
          id: el.id || null,
          name: el.getAttribute('name'),
          placeholder: el.getAttribute('placeholder'),
          ariaLabel: el.getAttribute('aria-label'),
          role: el.getAttribute('role'),
          className: el.getAttribute('class'),
          labelText: el.labels?.[0]?.textContent?.trim() || null,
          visibleText: (el.textContent || '').trim().slice(0, 60) || null,
        }))
      );

    console.log('\n=== FORM CONTROLS INSIDE THE APPOINTMENT WORKSPACE ===');
    console.log(JSON.stringify(controls, null, 2));

    const labels = await workspace
      .locator('label, legend, h1, h2, h3, h4')
      .allTextContents();
    console.log('\n=== LABELS / HEADINGS IN THE WORKSPACE ===');
    console.log(labels.map((t) => t.trim()).filter(Boolean));

    const html = await workspace.innerHTML();
    const outPath = path.join(__dirname, 'appointment-workspace.html');
    fs.writeFileSync(outPath, html);
    console.log(`\nFull workspace HTML written to: ${outPath}`);

    await page.screenshot({
      path: path.join(__dirname, 'appointment-workspace.png'),
      fullPage: true,
    });
    console.log('Screenshot written to: tools/appointment-workspace.png');
    console.log('\nBrowser stays open 20s so you can inspect it yourself.');
    await page.waitForTimeout(20000);
  } catch (err) {
    console.error('\nInspection failed:', err.message);
    await page.screenshot({
      path: path.join(__dirname, 'inspect-failure.png'),
      fullPage: true,
    }).catch(() => {});
  } finally {
    await browser.close();
  }
})();

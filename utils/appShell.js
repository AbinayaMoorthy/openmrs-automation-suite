/**
 * appShell.js — centralized "is the O3 app actually usable yet?" waits.
 *
 * WHY THIS EXISTS
 * ---------------
 * OpenMRS O3 is a single-spa microfrontend app. `domcontentloaded` fires on a
 * near-empty index.html; the real UI only appears after the import map plus
 * dozens of JS bundles are fetched and mounted.
 *
 * Every Playwright test gets a FRESH browser context, and a fresh context has
 * an EMPTY HTTP cache — so all 37 tests re-download the entire O3 bundle set
 * from a shared, frequently-overloaded public server. Observed cost of the
 * exact same wait across the suite: 9.9s on a good run, 46s on a bad one.
 *
 * That variance is what produced the "flaky" results: the waits were hard-coded
 * at 30s / 45s, which sits right in the middle of the observed range. Anything
 * on the slow side of the distribution failed, then passed on retry. The
 * locators were never wrong.
 *
 * So instead of sprinkling magic numbers around, all shell waits go through
 * here, with:
 *   1. A budget above test3's observed worst case (not just above its average).
 *   2. A single automatic reload if the shell never mounts — a bundle fetch
 *      dying on a cold context is common, and a reload costs seconds whereas a
 *      Playwright retry costs a whole test.
 *   3. One env knob (OMRS_SHELL_TIMEOUT) so a bad server day is a flag, not a
 *      code change.
 *
 * ── THE <header> TRAP (added after TC013 flaked) ─────────────────────────────
 * `waitForAppShell` waits for <header>. That is the *navigation shell* app
 * painting its own chrome. The icons INSIDE the navbar — search patient, add
 * patient, app menu, user menu — are separate extensions slotted into the
 * navbar by O3's extension system, each backed by its own bundle
 * (esm-patient-search-app, esm-patient-registration-app, ...). They mount
 * strictly AFTER <header> exists, and they can be seconds behind it.
 *
 * So "the shell is up" does NOT mean "the navbar icons exist." TC013 assumed it
 * did, kept a flat 30s expect budget, and hit exactly the same
 * timeout-inside-the-distribution failure this file was written to eliminate —
 * just one layer further in. `waitForNavbarAction` below gives those icons the
 * same treatment: real budget, reload-once recovery, one env knob.
 */

// Worst observed cold shell mount on test3 was ~46s. 75s leaves headroom
// without letting a genuinely dead page burn the whole test timeout.
const SHELL_TIMEOUT = Number(process.env.OMRS_SHELL_TIMEOUT || 75000);

// Budget for module content AFTER the shell is up. Once the shell has mounted,
// the remaining bundles are already warm in that context, so this is short.
const CONTENT_TIMEOUT = Number(process.env.OMRS_CONTENT_TIMEOUT || 45000);

// Budget for a navbar extension icon after <header> is up. These are small
// bundles but they queue behind everything else the page is still fetching on
// a cold context, so they get more than the old flat 30s.
const NAVBAR_TIMEOUT = Number(process.env.OMRS_NAVBAR_TIMEOUT || 45000);

// Budget for the LEFT SIDEBAR RAIL after <header> is up. The rail is its own
// extension too — same trap as the navbar icons, discovered when TC015 flaked:
// waitForDashboard() swallowed a 30s rail wait, then goToAppointments() blamed
// the appointments link 30s later. The rail is not the shell. It gets a budget.
const RAIL_TIMEOUT = Number(process.env.OMRS_RAIL_TIMEOUT || 45000);

/**
 * Known navbar action icons.
 *
 * `name` is matched against the ACCESSIBLE NAME (which aria-label supplies),
 * case-insensitively and with flexible whitespace, so a build that ships
 * "Search Patient" or "Search  patient" still matches. `fallbackAria` is a
 * looser substring used as a second chance via .or() in case the element is
 * rendered as something other than role=button in a given O3 build.
 */
const NAVBAR_ACTIONS = {
  search: {
    name: /search\s*patient/i,
    fallbackAria: 'search patient',
  },
  addPatient: {
    name: /add\s*patient/i,
    fallbackAria: 'add patient',
    // Confirmed from the inspector run that produced tests/patient.test.js.
    // This one is BETTER than the aria-label: data-tutorial-target is not a
    // translated string, so it survives locale changes that would break both
    // the accessible name and the aria-label.
    fallbackSelector: '[data-tutorial-target="add-patient"]',
  },
};

/**
 * Build a resilient locator for a navbar action icon.
 *
 * Deliberately NOT `[aria-label="Search patient"]`. That exact-match attribute
 * selector is one i18n string change or one capital letter away from silently
 * matching nothing — and "matches nothing" is indistinguishable from "hasn't
 * loaded yet" in a timeout error, which is what made TC013's failure ambiguous.
 */
function navbarAction(page, key) {
  const action = NAVBAR_ACTIONS[key];
  if (!action) {
    throw new Error(
      `Unknown navbar action "${key}". Known: ${Object.keys(NAVBAR_ACTIONS).join(', ')}`
    );
  }

  const header = page.locator('header').first();

  let locator = header
    .getByRole('button', { name: action.name })
    .or(header.locator(`[aria-label*="${action.fallbackAria}" i]`));

  if (action.fallbackSelector) {
    locator = locator.or(header.locator(action.fallbackSelector));
  }

  return locator.first();
}

/**
 * Wait until the O3 app shell (top navbar) has mounted.
 * Reloads once before giving up.
 */
async function waitForAppShell(page, { timeout = SHELL_TIMEOUT, allowReload = true } = {}) {
  const shell = page.locator('header').first();

  try {
    await shell.waitFor({ state: 'visible', timeout });
    return;
  } catch (err) {
    if (!allowReload) throw err;
  }

  console.warn(
    `[appShell] Shell did not mount within ${timeout}ms at ${page.url()} — ` +
    `reloading once (usually a dropped bundle fetch on a cold context).`
  );
  await page.reload({ waitUntil: 'domcontentloaded' });

  try {
    await shell.waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(
      `OpenMRS app shell never mounted at ${page.url()} — waited ${timeout}ms, ` +
      `reloaded, waited ${timeout}ms again.\n` +
      `This is almost always test3.openmrs.org being slow or down rather than a ` +
      `test defect. Raise the budget with OMRS_SHELL_TIMEOUT=120000 npm test, ` +
      `or check https://talk.openmrs.org for outage notices.`
    );
  }
}

/**
 * Wait for a navbar action icon (an extension slotted into the navbar) and
 * return its locator, so callers can assert on it directly:
 *
 *   const searchIcon = await waitForNavbarAction(page, 'search');
 *   await expect(searchIcon).toBeVisible();
 *
 * Same recovery shape as waitForAppShell: one reload before giving up, because
 * the failure mode here is identical (a dropped bundle fetch on a cold
 * context), and a reload is cheaper than burning a Playwright retry.
 */
async function waitForNavbarAction(
  page,
  key,
  { timeout = NAVBAR_TIMEOUT, allowReload = true } = {}
) {
  // The icons live inside the header, so make sure that much is true first —
  // otherwise a shell failure gets reported as a missing icon.
  await waitForAppShell(page);

  let icon = navbarAction(page, key);

  try {
    await icon.waitFor({ state: 'visible', timeout });
    return icon;
  } catch (err) {
    if (!allowReload) throw err;
  }

  console.warn(
    `[appShell] Navbar action "${key}" did not mount within ${timeout}ms at ` +
    `${page.url()} — reloading once (the icon is a separate extension bundle ` +
    `and can fail independently of the shell).`
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);

  icon = navbarAction(page, key);
  try {
    await icon.waitFor({ state: 'visible', timeout });
    return icon;
  } catch {
    throw new Error(
      `The O3 navbar mounted but the "${key}" action icon never appeared ` +
      `within ${timeout}ms at ${page.url()} (waited, reloaded, waited again).\n` +
      `Two possibilities, and the trace tells you which:\n` +
      `  1. Slow/failed extension bundle — the icon shows up late or not at ` +
      `all in the DOM snapshots. Raise OMRS_NAVBAR_TIMEOUT.\n` +
      `  2. The accessible name changed in this O3 build — the icon is on ` +
      `screen the whole time but no longer matches. Update NAVBAR_ACTIONS in ` +
      `utils/appShell.js.\n` +
      `Run: npx playwright show-trace test-results/.../trace.zip`
    );
  }
}

/**
 * Wait for `locator`, reloading the page once if it never appears.
 *
 * This is the recovery shape used everywhere in this file: a bundle fetch
 * dying on a cold context is common, a reload costs seconds, and a Playwright
 * retry costs a whole test. `rebuild` is called again after the reload because
 * a locator captured before a navigation may be stale.
 */
async function waitWithReload(page, rebuild, { timeout, label, allowReload = true }) {
  await waitForAppShell(page);

  try {
    await rebuild(page).waitFor({ state: 'visible', timeout });
    return rebuild(page);
  } catch (err) {
    if (!allowReload) throw err;
  }

  console.warn(
    `[appShell] ${label} did not mount within ${timeout}ms at ${page.url()} — ` +
    `reloading once (separate extension bundle; fails independently of the shell).`
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);

  try {
    await rebuild(page).waitFor({ state: 'visible', timeout });
    return rebuild(page);
  } catch {
    throw new Error(
      `The O3 shell mounted but ${label} never appeared within ${timeout}ms at ` +
      `${page.url()} (waited, reloaded, waited again).\n` +
      `Either the extension bundle is slow/failed — raise the budget — or the ` +
      `locator no longer matches this O3 build. The trace tells you which:\n` +
      `  npx playwright show-trace test-results/.../trace.zip`
    );
  }
}

/** A single left-rail link, e.g. sidebarLink(page, 'appointments'). */
function sidebarLink(page, hrefFragment) {
  return page.locator(`a[href*="${hrefFragment}"]`).first();
}

/**
 * Wait for the left sidebar rail to have mounted at all.
 * Satisfied by any known rail link — they all ship in the same extension, so
 * one being present means the rail is up.
 */
async function waitForSidebarRail(page, { timeout = RAIL_TIMEOUT, allowReload = true } = {}) {
  const rebuild = (pg) =>
    pg.locator('a[href*="service-queues"]').or(pg.locator('a[href*="appointments"]')).first();
  return waitWithReload(page, rebuild, { timeout, label: 'the left sidebar rail', allowReload });
}

/** Wait for one specific rail link and return it, ready to click. */
async function waitForSidebarLink(page, hrefFragment, { timeout = RAIL_TIMEOUT, allowReload = true } = {}) {
  return waitWithReload(page, (pg) => sidebarLink(pg, hrefFragment), {
    timeout,
    label: `the "${hrefFragment}" sidebar link`,
    allowReload,
  });
}

/**
 * Navigate to `url` and wait for the shell. Use this instead of a bare
 * page.goto() anywhere a test needs a usable page.
 */
async function gotoAndWaitForShell(page, url, opts = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page, opts);
}

/**
 * Wait for a module's own content after the shell is up.
 * `anchor` should be a locator that is unambiguously part of that module.
 */
async function waitForModuleContent(page, anchor, { timeout = CONTENT_TIMEOUT, label = 'module', allowReload = true } = {}) {
  // Upgraded after TC010 flaked. Module content is yet another separately
  // mounted extension — the FOURTH place this suite hit the same trap (navbar
  // icons, patient page, sidebar rail, now dashboard content). It gets the
  // same treatment as the rest: real budget, reload-once recovery, and an
  // error that names both possible causes instead of just "not found".
  return waitWithReload(page, () => anchor.first(), {
    timeout,
    label: `the ${label} content`,
    allowReload,
  });
}

module.exports = {
  waitForAppShell,
  gotoAndWaitForShell,
  waitForSidebarRail,
  waitForSidebarLink,
  sidebarLink,
  RAIL_TIMEOUT,
  waitForModuleContent,
  waitForNavbarAction,
  navbarAction,
  NAVBAR_ACTIONS,
  SHELL_TIMEOUT,
  CONTENT_TIMEOUT,
  NAVBAR_TIMEOUT,
};

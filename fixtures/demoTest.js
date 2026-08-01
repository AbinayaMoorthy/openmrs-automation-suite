/**
 * fixtures/demoTest.js — presentation mode.
 *
 * WHY
 * ---
 * The suite is built to run fast and unattended, which makes it useless to
 * watch: actions fire instantly and the browser closes the moment the last
 * assertion resolves, so an audience never sees what happened.
 *
 * This wraps Playwright's `test` with an auto-fixture that, ONLY when DEMO is
 * set, holds each test's final state on screen and paints a small badge with
 * the test ID so a viewer can follow along.
 *
 * With DEMO unset this is a pass-through. Normal runs are byte-for-byte
 * unaffected — no timing change, no DOM change, nothing injected.
 *
 * USAGE
 *   Windows CMD:    set DEMO=1 && npx playwright test --grep @smoke
 *   PowerShell:     $env:DEMO=1; npx playwright test --grep @smoke
 *   Reset CMD:      set DEMO=
 *
 * KNOBS
 *   DEMO_SLOWMO   ms between actions (see playwright.config.js) — default 700
 *   DEMO_HOLD     ms to hold the final state per test           — default 2500
 *   DEMO_BADGE    set to 0 to disable the on-screen badge
 */
const base = require('@playwright/test');

const DEMO = Boolean(process.env.DEMO);
const HOLD = Number(process.env.DEMO_HOLD || 2500);
const BADGE = process.env.DEMO_BADGE !== '0';

/**
 * The badge shows ONLY the test ID ("TC013"), never the full title.
 *
 * That is deliberate, not cosmetic. Injecting the full title would put strings
 * like "Service queues heading should be visible" into the DOM, and this suite
 * locates elements with getByText('Service queues'). The badge would become a
 * second match and could satisfy an assertion that the real app failed — a
 * demo aid that manufactures false passes is worse than no demo aid. No
 * locator in this suite searches for /TC\d{3}/, so an ID-only badge cannot
 * collide with anything.
 */
function badgeScript(label) {
  return (text) => {
    const draw = () => {
      if (!document.body || document.getElementById('__demo_badge__')) return;
      const el = document.createElement('div');
      el.id = '__demo_badge__';
      el.textContent = text;
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, {
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: '2147483647',
        background: 'rgba(15,15,20,0.88)',
        color: '#fff',
        font: '600 15px/1.3 ui-sans-serif, system-ui, sans-serif',
        letterSpacing: '0.04em',
        padding: '8px 14px',
        borderRadius: '8px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      });
      document.body.appendChild(el);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', draw);
    } else {
      draw();
    }
  };
}

const test = base.test.extend({
  _demo: [
    async ({ page }, use, testInfo) => {
      if (DEMO && BADGE) {
        const match = testInfo.title.match(/TC\d{3}/);
        const label = match ? match[0] : 'DEMO';
        // addInitScript re-runs on every navigation, so the badge survives
        // page.goto() and the reload inside appShell's recovery path.
        await page.addInitScript(badgeScript(label), label);
      }

      await use();

      // Hold the final state so the audience can actually read the screen.
      // Wrapped because the page may already be closing on a failure path —
      // a demo helper must never be the thing that fails a test.
      if (DEMO) {
        try {
          await page.waitForTimeout(HOLD);
        } catch {
          /* page already closed — nothing to hold */
        }
      }
    },
    { auto: true },
  ],
});

module.exports = { test, expect: base.expect };

const { test, expect } = require('../fixtures/demoTest');
const { NavigationPage } = require('../pages/NavigationPage');
const {
  gotoAndWaitForShell,
  waitForNavbarAction,
  waitForModuleContent,
} = require('../utils/appShell');
const { urls } = require('../test-data/testData');

test.describe('Module 2 — Navigation & Dashboard Tests', () => {

  // Session comes from storageState (see global-setup.js) — just land on the
  // dashboard, no login needed.
  //
  // This used to be a hard-coded 30s wait on locator('header'). TC009 and
  // TC014 both blew that budget and then passed on retry in 14.3s and 9.8s —
  // classic "the timeout sits inside the distribution" flake, not a locator
  // bug. gotoAndWaitForShell gives it a realistic budget plus one reload.
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForShell(page, urls.home);
  });

  // ─────────────────────────────────────────────
  // DASHBOARD TESTS
  // ─────────────────────────────────────────────

  test('TC008 @smoke — Dashboard should load after login', async ({ page }) => {
    expect(page.url()).toContain('/home/');
  });

  // TC009-TC011 assert on the service-queues DASHBOARD CONTENT, which is a
  // separately mounted extension — beforeEach only guarantees the shell. They
  // used to carry a flat 30s expect budget against it, which is what made
  // TC010 flake (not found at 30s, passed on retry in 12.5s). Routed through
  // waitForModuleContent for a real budget plus reload-once recovery.

  test('TC009 — Service queues heading should be visible', async ({ page }) => {
    const heading = page.getByText('Service queues');
    await waitForModuleContent(page, heading, { label: 'service queues heading' });
    await expect(heading.first()).toBeVisible();
  });

  test('TC010 — Checked-in patients count should be visible', async ({ page }) => {
    const metric = page.getByText('Checked in patients');
    await waitForModuleContent(page, metric, { label: 'checked-in patients metric' });
    await expect(metric.first()).toBeVisible();
  });

  test('TC011 — Patients currently in queue section should exist', async ({ page }) => {
    const section = page.getByText('Patients Currently In Queue');
    await waitForModuleContent(page, section, { label: 'patient queue section' });
    await expect(section.first()).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // SIDEBAR NAVIGATION TESTS
  // ─────────────────────────────────────────────

  test('TC012 @smoke — All sidebar navigation links should be visible', async ({ page }) => {
    const nav = new NavigationPage(page);
    await nav.waitForDashboard();

    await expect(page.locator('a[href*="appointments"]').first())
      .toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Patient lists').first())
      .toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Wards').first())
      .toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Laboratory').first())
      .toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Billing').first())
      .toBeVisible({ timeout: 30000 });
  });

  // WHY THESE TWO CHANGED
  // ---------------------
  // The old comment here said "beforeEach already guarantees the shell/header
  // is up" — true, and irrelevant. The navbar icons are extensions slotted
  // into the navbar, each with its own bundle; they mount strictly after
  // <header> exists. So beforeEach guarantees nothing about them, and these
  // tests were left holding a flat 30s expect budget — the exact pattern
  // utils/appShell was written to kill, one layer further in. TC013 duly hit
  // it (failed at 30s, passed on retry in 13.6s).
  //
  // waitForNavbarAction gives them a real budget plus reload-once recovery,
  // and matches on accessible name rather than an exact aria-label string.

  test('TC013 — Top navbar search icon should be visible', async ({ page }) => {
    const searchIcon = await waitForNavbarAction(page, 'search');
    await expect(searchIcon).toBeVisible();
  });

  test('TC014 — Top navbar add patient icon should be visible', async ({ page }) => {
    const addPatientIcon = await waitForNavbarAction(page, 'addPatient');
    await expect(addPatientIcon).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // PAGE NAVIGATION TESTS
  // ─────────────────────────────────────────────

  test('TC015 — Clicking Appointments link should navigate correctly', async ({ page }) => {
    const nav = new NavigationPage(page);
    await nav.goToAppointments();
    expect(page.url()).toContain('appointments');
  });

  test('TC016 — Navigating back to service queues should work', async ({ page }) => {
    // Go to appointments first. This is a full page load, so it needs the
    // shell helper too — the old inline 45s getByText wait here was the same
    // pattern that made TC034 flake.
    await gotoAndWaitForShell(page, urls.appointments);

    // Navigate back to service queues via the sidebar (client-side routing)
    const nav = new NavigationPage(page);
    await nav.goToServiceQueues();
    expect(page.url()).toContain('service-queues');
  });

});

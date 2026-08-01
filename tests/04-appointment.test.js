const { test, expect } = require('../fixtures/demoTest');
const { AppointmentPage } = require('../pages/AppointmentPage');
const { waitForModuleContent } = require('../utils/appShell');

test.describe('Module 4 — Appointment Management Tests', () => {

  // No beforeEach login — session comes from storageState (global-setup.js)
  // and every test calls appointmentPage.goto() itself.

  // ─────────────────────────────────────────────
  // APPOINTMENTS PAGE LOAD TESTS
  // ─────────────────────────────────────────────

  test('TC029 @smoke — Appointments page should load successfully', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    const isLoaded = await appointmentPage.isLoaded();
    expect(isLoaded).toBeTruthy();
  });

  test('TC030 — Appointments page URL should contain appointments', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    expect(page.url()).toContain('appointments');
  });

  test('TC031 — Appointments page should show heading', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    await expect(page.getByText('Appointments').first()).toBeVisible();
  });

  test('TC032 — Add appointment button should be visible', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    // goto() is satisfied by ANY of moduleReady's three anchors, so this
    // specific one may still be mounting. Give it its own budget.
    await waitForModuleContent(page, appointmentPage.addAppointmentButton, {
      label: 'add appointment button',
    });
    await expect(appointmentPage.addAppointmentButton).toBeVisible();
  });

  test('TC033 — Scheduled appointments metric card should be visible', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    await waitForModuleContent(page, appointmentPage.scheduledCard, {
      label: 'scheduled appointments card',
    });
    await expect(appointmentPage.scheduledCard).toBeVisible();
  });

  test('TC034 — Appointments calendar button should be visible', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    // This test was never failing on its assertion — it was dying inside
    // goto()'s old blind 45s wait. The locator below was fine all along.
    await waitForModuleContent(page, appointmentPage.calendarButton, {
      label: 'appointments calendar button',
    });
    await expect(appointmentPage.calendarButton).toBeVisible();
  });

  test('TC035 — Create new appointment form should open', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    const workspace = await appointmentPage.openCreateForm();
    await expect(workspace).toBeVisible();
  });

  test('TC036 — Appointment form should have patient search field', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    await appointmentPage.openCreateForm();

    // The old locator matched by placeholder only, page-wide, after a fixed
    // 2s sleep. It reported "element(s) not found" — the O3 workspace's
    // patient field is a Carbon Search/ComboBox that usually has no
    // placeholder attribute at all. The POM getter now matches on type, role,
    // aria-label, id and name as well, scoped to the workspace.
    try {
      await expect(appointmentPage.patientSearchField).toBeVisible({ timeout: 45000 });
    } catch (err) {
      // If it STILL misses, don't just say "not found" — say what IS there,
      // so the next run pins the real selector instead of guessing again.
      const inventory = await appointmentPage.workspace
        .locator('input, [role="combobox"], [role="searchbox"], select, textarea')
        .evaluateAll((els) =>
          els.map((el) => ({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type'),
            id: el.id || null,
            name: el.getAttribute('name'),
            placeholder: el.getAttribute('placeholder'),
            ariaLabel: el.getAttribute('aria-label'),
            role: el.getAttribute('role'),
            labelText: el.labels?.[0]?.textContent?.trim() || null,
          }))
        )
        .catch(() => []);

      throw new Error(
        `${err.message}\n\n` +
        `--- Fields actually present in the appointment workspace ---\n` +
        (inventory.length
          ? JSON.stringify(inventory, null, 2)
          : '(none — the workspace may not have rendered its fields yet, or ' +
            'this O3 build launches the appointment form without a patient ' +
            'search step when opened from the appointments dashboard)') +
        `\n\nPick the real field from the list above and add its selector to ` +
        `AppointmentPage.patientSearchField. If the list is empty of anything ` +
        `patient-related, this build genuinely has no patient search in this ` +
        `workspace and TC036 should be retired rather than fixed.`
      );
    }
  });

  test('TC037 — Appointment form should be closeable', async ({ page }) => {
    const appointmentPage = new AppointmentPage(page);
    await appointmentPage.goto();
    const workspace = await appointmentPage.openCreateForm();

    // O3 appointment form: "Discard" in the footer; some builds have a header
    // close (X). Try those, else fall back to Escape.
    const discard = page.getByRole('button', { name: /discard/i }).first();
    const closeX  = page.getByRole('button', { name: /close|hide/i }).first();

    if (await discard.isVisible().catch(() => false)) {
      await discard.click();
    } else if (await closeX.isVisible().catch(() => false)) {
      await closeX.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // Real success criterion: the form is gone
    await expect(workspace).toBeHidden({ timeout: 30000 });
  });
});

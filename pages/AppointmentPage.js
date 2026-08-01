// AppointmentPage — Page Object Model
// Handles appointment scheduling, viewing, and management
//
// FIX NOTES (this revision):
// - goto() no longer does one 45s blind wait on getByText('Appointments').
//   That text also matches the SIDEBAR LINK, which mounts with the shell — so
//   the wait was really "has the shell loaded?" wearing an appointments
//   costume. It is now two explicit stages with separate budgets and separate
//   error messages: shell first (utils/appShell), then appointments content.
// - patientSearchField is scoped to the workspace form and no longer relies on
//   the placeholder attribute alone. See the comment on that getter.

const { gotoAndWaitForShell, waitForModuleContent } = require('../utils/appShell');
const { urls } = require('../test-data/testData');

class AppointmentPage {
  constructor(page) {
    this.page = page;

    this.addAppointmentButton = page.getByRole('button', {
      name: 'Create new appointment'
    });

    // Calendar control — button or link, any label containing "calendar"
    this.calendarButton = page
      .getByRole('button', { name: /calendar/i })
      .or(page.getByRole('link', { name: /calendar/i }))
      .first();

    // Metrics cards visible on page
    this.scheduledCard    = page.getByText('Scheduled appointments');
    this.highVolumeCard   = page.getByText('Highest volume service');
    this.providersCard    = page.getByText('Providers booked');

    // Appointment rows
    this.appointmentRows  = page.locator('tbody tr, [data-testid*="appointment-row"]');

    // Anchor proving the APPOINTMENTS MODULE rendered — not just the shell.
    // Any one of these is sufficient, so a UI reshuffle in one of them does
    // not take the whole file down.
    this.moduleReady = this.addAppointmentButton
      .or(this.scheduledCard)
      .or(page.getByRole('heading', { name: /appointments/i }));
  }

  /**
   * The appointment workspace panel. O3 builds differ on whether this carries
   * role="dialog", role="complementary", or nothing at all — so the <form> is
   * accepted as a fallback signal (TC036/TC038 already prove that one works).
   */
  get workspace() {
    return this.page
      .locator('[role="dialog"], [role="complementary"], [class*="workspace"], form')
      .first();
  }

  /**
   * Patient search field inside the appointment workspace.
   *
   * The old locator was placeholder-only:
   *   input[placeholder*="patient" i], [placeholder*="search" i], [placeholder*="name" i]
   * and it matched nothing — note the failure said "element(s) not found"
   * rather than timing out on a hidden element. Two reasons that happens here:
   *
   *   1. The field is a Carbon Search / ComboBox. Carbon labels those via
   *      `labelText` (a <label> plus aria-label) and frequently renders NO
   *      placeholder attribute at all. A placeholder-only selector cannot
   *      see such a field, no matter how long it waits.
   *   2. Carbon's search input is type="search" with the accessible name on
   *      the wrapper, so role/aria matching finds it where CSS placeholder
   *      matching does not.
   *
   * So: cast a much wider net (type, role, aria-label, id, name — not just
   * placeholder) AND scope it to the workspace, because the old page-wide
   * .first() could have grabbed the top navbar's patient search instead and
   * passed for entirely the wrong reason.
   */
  get patientSearchField() {
    return this.workspace.locator([
      'input[type="search"]',
      'input[role="combobox"]',
      '[role="combobox"] input',
      '[role="searchbox"]',
      'input[placeholder*="patient" i]',
      'input[placeholder*="search" i]',
      'input[placeholder*="name" i]',
      'input[aria-label*="patient" i]',
      'input[aria-label*="search" i]',
      'input[id*="patient" i]',
      'input[id*="search" i]',
      'input[name*="patient" i]',
    ].join(', ')).first();
  }

  // Navigate to appointments page and wait until it is actually usable
  async goto() {
    // Stage 1 — shell (the expensive, high-variance part)
    await gotoAndWaitForShell(this.page, urls.appointments);

    // Stage 2 — the appointments module's own content
    await waitForModuleContent(this.page, this.moduleReady, {
      label: 'appointments',
    });
  }

  // Open the "Create new appointment" workspace and wait for it to render
  async openCreateForm() {
    // goto()'s moduleReady is an .or() of three anchors, so reaching here does
    // not prove the button specifically has mounted. Same reason the workspace
    // needs its own budget: it is a separate lazily-loaded panel.
    await waitForModuleContent(this.page, this.addAppointmentButton, {
      label: 'add appointment button',
    });
    await this.addAppointmentButton.click();
    await waitForModuleContent(this.page, this.workspace, {
      label: 'appointment workspace',
    });
    return this.workspace;
  }

  // Check if appointments page loaded
  async isLoaded() {
    return this.page.url().includes('appointments');
  }

  // Get page heading text
  async getHeading() {
    const heading = this.page.locator('h1, h2, h3, [data-testid*="header"]').first();
    return await heading.textContent();
  }

  // Count total appointments visible
  async getAppointmentCount() {
    return await this.appointmentRows.count();
  }

  // Check if add button is visible
  async isAddButtonVisible() {
    return await this.addAppointmentButton.isVisible();
  }

  // Click add appointment (kept for backwards compatibility)
  async clickAddAppointment() {
    await this.openCreateForm();
  }

  // Navigate to specific tab
  async clickTab(tabName) {
    const tab = this.page.getByRole('tab', { name: new RegExp(tabName, 'i') });
    await tab.waitFor({ state: 'visible', timeout: 10000 });
    await tab.click();
  }
}

module.exports = { AppointmentPage };

/**
 * PatientPage — Page Object Model
 * Handles patient registration, search, and management
 *
 * FIX NOTES (aligned with NavigationPage + utils/appShell):
 * - Navbar icons now come from navbarAction() instead of exact
 *   `[aria-label="Search patient"]`. Those icons are extensions slotted into
 *   the navbar; they mount after <header>, and their labels are translated
 *   strings. An exact attribute match is one i18n change away from matching
 *   nothing — and "matches nothing" is indistinguishable from "still loading"
 *   in a timeout error. This is the same defect that made TC013 flake.
 * - goToDashboard() / goToRegistration() no longer swallow their waits with
 *   .catch(() => {}). That pattern turns "the page never loaded" into a
 *   confusing assertion failure 30-45s later, in a different place, blaming an
 *   innocent locator. NavigationPage already removed it; this file had kept it.
 * - Fixed waitForTimeout() sleeps replaced with waits on the thing we actually
 *   care about, except one debounce settle that is genuinely time-based (see
 *   searchPatientViaIcon).
 */
const {
  gotoAndWaitForShell,
  waitForModuleContent,
  waitForNavbarAction,
  navbarAction,
} = require('../utils/appShell');

const REGISTRATION_URL = 'https://test3.openmrs.org/openmrs/spa/patient-registration';
const DASHBOARD_URL    = 'https://test3.openmrs.org/openmrs/spa/home/service-queues';
const SEARCH_URL       = 'https://test3.openmrs.org/openmrs/spa/search?query=';

class PatientPage {
  constructor(page) {
    this.page = page;

    // Top navbar — search and add patient icons (extensions, not shell)
    this.searchIcon       = navbarAction(page, 'search');
    this.addPatientIcon   = navbarAction(page, 'addPatient');

    // Patient search input (appears after clicking search icon)
    this.searchInput      = page.locator('input[placeholder*="Search"], input[type="search"]').first();

    // Search results — CONFIRMED against the live build with
    // tools/inspect-patient-search.js. The old locator here was
    // '.omrs-search-result, [data-testid*="patient-search"], .patient-search-result-item',
    // which matched 0 elements for BOTH a hit query and a no-match query.
    //
    // Deliberately NOT keyed on the row's own class. The real one is
    //   -esm-patient-search__compact-patient-banner__patientSearchResult___fJ6Ec
    // where the ___fJ6Ec suffix is a build-time CSS-module hash — it changes
    // whenever the module is rebuilt, so a locator using it is broken by the
    // next O3 release. data-testid and the chart href are stable.
    this.searchResultsPanel = page.locator('[data-testid="floatingSearchResultsContainer"]');
    this.searchResults      = this.searchResultsPanel.locator('a[href*="/patient/"]');

    // Empty state, verified wording: "Sorry, no patient charts were found".
    // Matched loosely so a copy tweak does not break the test; page-scoped
    // because it is not guaranteed to render inside the results container.
    this.searchEmptyState   = page.getByText(/no patient charts were found/i).first();

    // Registration form — Step 1: Name
    this.firstNameInput   = page.locator('#givenName');
    this.middleNameInput  = page.locator('#middleName');
    this.lastNameInput    = page.locator('#familyName');

    // Registration form — Step 2: Gender
    this.genderSelect     = page.locator('select[name="gender"], #gender').first();

    // Registration form — Step 3: Date of Birth
    this.dobDayInput      = page.locator('#birthdateDay');
    this.dobMonthInput    = page.locator('#birthdateMonth');
    this.dobYearInput     = page.locator('#birthdateYear');

    // Registration form — navigation buttons
    this.nextButton       = page.getByRole('button', { name: /next/i }).first();
    this.submitButton     = page.getByRole('button', { name: /register patient|submit|save/i }).first();

    // Success indicators
    this.patientBanner    = page.locator('.patient-banner, [data-testid="patient-banner"]');
    this.successNotif     = page.locator('.notification--success, [data-testid="success"]');
  }

  /**
   * Navigate to patient registration and wait until the form is really usable.
   *
   * BEHAVIOUR CHANGE: this used to swallow the form wait, so callers that only
   * assert on the URL would pass even when the form never rendered. It now
   * throws with a clear message instead. That is stricter — if TC017/TC018
   * start failing here, it is reporting a real problem the old code hid.
   */
  async goToRegistration() {
    await gotoAndWaitForShell(this.page, REGISTRATION_URL);
    await waitForModuleContent(this.page, this.firstNameInput, {
      label: 'patient registration form',
    });
  }

  // Navigate to home dashboard
  async goToDashboard() {
    await gotoAndWaitForShell(this.page, DASHBOARD_URL);
  }

  // Navigate to the standalone patient search page
  async goToSearch() {
    await gotoAndWaitForShell(this.page, SEARCH_URL);
  }

  /**
   * Open search via the navbar icon.
   * waitForNavbarAction gives the icon a real budget plus reload-once recovery,
   * then we wait for the input rather than sleeping a fixed 1.5s.
   */
  async openSearchViaIcon() {
    const icon = await waitForNavbarAction(this.page, 'search');
    await icon.click();
    await waitForModuleContent(this.page, this.searchInput, {
      label: 'patient search input',
      timeout: 30000,
    });
    return this.searchInput;
  }

  /**
   * Click the navbar add-patient icon and wait for the registration route.
   */
  async openRegistrationViaIcon() {
    const icon = await waitForNavbarAction(this.page, 'addPatient');
    await icon.click();
    await this.page.waitForURL('**/patient-registration**', { timeout: 45000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait until the search has actually settled.
   *
   * Replaces a blind 2.5s sleep. A debounced search has exactly two terminal
   * states — at least one result row, or the empty-state message — so we wait
   * for whichever arrives. Faster on a good run, and it still holds on a slow
   * one instead of asserting against a half-rendered panel.
   */
  async waitForSearchSettled({ timeout = 30000 } = {}) {
    const settled = this.searchResults.first().or(this.searchEmptyState);
    try {
      await settled.waitFor({ state: 'visible', timeout });
    } catch {
      throw new Error(
        `Patient search never settled within ${timeout}ms — neither a result ` +
        `row nor the empty-state message appeared at ${this.page.url()}.\n` +
        `Re-run tools/inspect-patient-search.js; the result or empty-state ` +
        `markup may have changed in this O3 build.`
      );
    }
  }

  // Search for a patient using navbar search
  async searchPatientViaIcon(name) {
    const input = await this.openSearchViaIcon();
    await input.fill(name);
    await this.waitForSearchSettled();
  }

  // Get count of search results
  async getSearchResultCount() {
    return await this.searchResults.count();
  }

  // Check if registration page loaded
  async isRegistrationPageLoaded() {
    return this.page.url().includes('patient-registration');
  }

  // Get current URL
  async getCurrentUrl() {
    return this.page.url();
  }
}

module.exports = { PatientPage };

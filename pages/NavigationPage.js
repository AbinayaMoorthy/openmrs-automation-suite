/**
 * NavigationPage — Page Object Model
 * Handles sidebar navigation and top navbar interactions
 *
 * FIX NOTES:
 * - Removed all waitForLoadState('networkidle'). OpenMRS O3 polls constantly
 *   (session/FHIR/offline requests), so the network never goes idle and those
 *   waits hang until the test timeout. We wait for URLs/elements instead.
 * - waitForDashboard() no longer swallows its own failure with .catch(() => {}).
 *   That turned "the shell never loaded" into a confusing assertion failure
 *   30s later, in a different place, blaming an innocent locator. Shell waits
 *   now go through utils/appShell so there is exactly one budget and one clear
 *   error message.
 * - Top navbar icons now come from utils/appShell's navbarAction() instead of
 *   exact `[aria-label="..."]` selectors. Those icons are extensions slotted
 *   into the navbar, so they mount after <header> and their labels are
 *   translated strings — an exact attribute match is one i18n change away from
 *   matching nothing, and "matches nothing" looks identical to "still loading"
 *   in a timeout error. See the header trap note in utils/appShell.js.
 */
const {
  waitForAppShell,
  navbarAction,
  waitForNavbarAction,
  waitForSidebarRail,
  waitForSidebarLink,
} = require('../utils/appShell');

class NavigationPage {
  constructor(page) {
    this.page = page;

    // Left sidebar navigation links
    this.serviceQueuesLink  = page.locator('a[href*="service-queues"]').first();
    this.appointmentsLink   = page.locator('a[href*="appointments"]').first();
    this.patientListsLink   = page.getByText('Patient lists').first();
    this.wardsLink          = page.getByText('Wards').first();
    this.laboratoryLink     = page.getByText('Laboratory').first();
    this.billingLink        = page.getByText('Billing').first();

    // Top navbar items
    this.openMRSLogo        = page.locator('[aria-label="OpenMRS logo"], .omrs-logo').first();
    this.searchPatientIcon  = navbarAction(page, 'search');
    this.addPatientIcon     = navbarAction(page, 'addPatient');
    this.notificationsIcon  = page.locator('[aria-label*="notification" i]').first();
    this.userMenuIcon       = page.locator('[aria-label="Users"], [aria-label*="user menu" i]').first();
    this.appMenuIcon        = page.locator('[aria-label="Open menu"], .omrs-navbar-menu').first();

    // Location selector
    this.locationDisplay    = page.locator('.omrs-location, [data-testid="location"]').first();
  }

  /**
   * Wait for dashboard to be usable: shell first, then the sidebar rail.
   *
   * This used to swallow the rail wait with .catch(() => {}). TC015 is what
   * that cost: on a slow run the rail had not mounted, the swallowed 30s
   * expired in silence, and the NEXT line failed 30s later pointing at
   * appointmentsLink — a locator that was never the problem. The rail is a
   * separate extension, so it now gets a real budget and reload-once recovery,
   * and it reports its own failure instead of handing the blame downstream.
   */
  async waitForDashboard() {
    await waitForSidebarRail(this.page);
  }

  /**
   * Wait for a top navbar icon to actually mount, with reload-once recovery.
   * Prefer this over asserting on the constructor locators directly — <header>
   * being visible does not mean the icons inside it have mounted.
   */
  async waitForSearchPatientIcon(opts) {
    return waitForNavbarAction(this.page, 'search', opts);
  }

  async waitForAddPatientIcon(opts) {
    return waitForNavbarAction(this.page, 'addPatient', opts);
  }

  // Navigate using sidebar links
  async goToAppointments() {
    const link = await waitForSidebarLink(this.page, 'appointments');
    await link.click();
    // Wait for the actual navigation result instead of network idle
    await this.page.waitForURL('**/appointments**', { timeout: 30000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async goToServiceQueues() {
    const link = await waitForSidebarLink(this.page, 'service-queues');
    await link.click();
    await this.page.waitForURL('**/service-queues**', { timeout: 30000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  // Check all nav items exist
  async areNavItemsVisible() {
    const appointments = await this.appointmentsLink.isVisible();
    const patientLists = await this.patientListsLink.isVisible();
    const wards = await this.wardsLink.isVisible();
    return appointments && patientLists && wards;
  }

  // Check top navbar icons.
  // isVisible() does NOT auto-wait — it samples the DOM right now. Make sure
  // the icons have had their mount budget before calling this, or it will
  // report false purely because the extension bundle is still in flight.
  async areNavbarIconsVisible() {
    const search = await this.searchPatientIcon.isVisible();
    const add = await this.addPatientIcon.isVisible();
    return search && add;
  }

  // Get current location name shown in navbar
  async getLocationName() {
    try {
      return await this.locationDisplay.textContent();
    } catch {
      return 'Location not found';
    }
  }
}

module.exports = { NavigationPage };

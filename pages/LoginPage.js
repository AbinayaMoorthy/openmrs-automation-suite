/**
 * LoginPage — Page Object Model
 * Handles two-step login flow of OpenMRS O3:
 * Step 1: Enter username → Continue
 * Step 2: Enter password → Log in
 */
class LoginPage {
  constructor(page) {
    this.page = page;

    // Step 1 — Username screen
    this.usernameInput    = page.locator('#username');
    this.continueButton   = page.getByRole('button', { name: 'Continue' });

    // Step 2 — Password screen
    this.passwordInput    = page.locator('#password');
    this.loginButton      = page.getByRole('button', { name: 'Log in' });

    // Post-login verification
    this.userMenuButton   = page.locator('[aria-label="Users"]');
    this.logoutButton     = page.getByRole('button', { name: 'Logout' });
  }

  // Navigate to login page with clean session
  async goto() {
    await this.page.context().clearCookies();
    await this.page.goto('https://test3.openmrs.org/openmrs/spa/login', {
      waitUntil: 'domcontentloaded'
    });
    // The username field appearing IS the signal the page is ready —
    // no need for networkidle (which rarely fires on O3 anyway)
    await this.usernameInput.waitFor({ state: 'visible', timeout: 30000 });
  }

  // Full login flow — username → continue → password → log in
  async login(username = 'admin', password = 'Admin123') {
    await this.usernameInput.fill(username);
    await this.continueButton.click();
    await this.passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.handleLocationSelection();
  }

  async handleLocationSelection() {
    try {
      const locationSearch = this.page.locator('[placeholder="Search for a location"]');
      const isVisible = await locationSearch.isVisible({ timeout: 5000 });
      if (isVisible) {
        await this.page.getByText('Outpatient Clinic').click();

        // Was a blind 500ms sleep. Wait for the confirm button instead — that
        // is the actual signal the location panel finished reacting.
        const confirm = this.page.getByRole('button', { name: /confirm/i });
        await confirm.waitFor({ state: 'visible', timeout: 15000 });

        const rememberCheckbox = this.page.locator('input[type="checkbox"]').first();
        if (await rememberCheckbox.isVisible().catch(() => false)) {
          await rememberCheckbox.click();
        }
        await confirm.click();
      }
      await this.page.waitForURL('**/home/**', { timeout: 20000 });
    } catch {
      await this.page.waitForURL('**/home/**', { timeout: 20000 });
    }
  }

  /**
   * Login without waiting for redirect (for negative tests).
   *
   * The fixed settle below stays, deliberately. Proving a NEGATIVE has no
   * "it appeared" event to wait for — we are checking that a redirect never
   * happens, so we must give the app a fair chance to perform one and then
   * look. Note the failure direction: too SHORT risks a false pass, so this is
   * generous rather than tight. Callers should also assert we are still on the
   * login step, which is stronger evidence than the URL alone.
   */
  async loginWithoutWait(username, password) {
    await this.usernameInput.fill(username);
    await this.continueButton.click();
    await this.passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.page.waitForTimeout(5000);
  }

  /**
   * Enter username and click continue only.
   *
   * The blind 2s sleep that used to live here was a trap: TC005 then called
   * isPasswordStepVisible(), which uses isVisible() — and isVisible() does NOT
   * auto-wait, it samples the DOM right now. So if the password step took
   * 2.1s, TC005 failed on a perfectly working app. No sleep here now; TC005
   * asserts with expect().toBeVisible(), which retries properly.
   */
  async enterUsername(username) {
    await this.usernameInput.fill(username);
    await this.continueButton.click();
  }

  // Check if password field appeared after clicking continue
  async isPasswordStepVisible() {
    return await this.passwordInput.isVisible();
  }

  async isLoggedIn() {
    return this.page.url().includes('/home/');
  }

  async getPageTitle() {
    return await this.page.title();
  }
}

module.exports = { LoginPage };

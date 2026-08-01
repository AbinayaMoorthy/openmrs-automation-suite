const { test, expect } = require('../fixtures/demoTest');
const { LoginPage } = require('../pages/LoginPage');
const { users } = require('../test-data/testData');

// These tests verify the login flow itself, so they must start
// UNAUTHENTICATED — override the suite-wide storageState with an empty one.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Module 1 — Login & Authentication Tests', () => {

  // ─────────────────────────────────────────────
  // POSITIVE TESTS
  // ─────────────────────────────────────────────

  test('TC001 @smoke — Valid credentials should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(users.admin.username, users.admin.password);
    const loggedIn = await loginPage.isLoggedIn();
    expect(loggedIn).toBeTruthy();
  });

  test('TC002 @smoke — Dashboard URL should contain /home after login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(users.admin.username, users.admin.password);
    expect(page.url()).toContain('/home/');
  });

  test('TC003 — Login page title should be OpenMRS', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    const title = await loginPage.getPageTitle();
    expect(title).toContain('OpenMRS');
  });

  test('TC004 — Username field should be visible on login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(page.locator('#username')).toBeVisible();
  });

  test('TC005 — Continue button should appear after entering username', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.enterUsername(users.admin.username);
    // expect().toBeVisible() auto-waits and retries. The old version called
    // isPasswordStepVisible() (a bare isVisible(), no waiting) after a blind
    // 2s sleep in the page object — so a password step arriving at 2.1s
    // failed a working app.
    await expect(loginPage.passwordInput).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // NEGATIVE TESTS
  // ─────────────────────────────────────────────

  test('TC006 — Invalid password should not login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginWithoutWait(users.admin.username, 'wrongpassword');
    expect(page.url()).not.toContain('/home/');

    // Stronger than "not the dashboard" alone, which would also pass if the
    // app crashed to a blank page.
    //
    // Do NOT assert on #password here. A rejected login sends you BACK to the
    // username step, and O3 keeps the password input in the DOM as an inactive
    // step — the failure output showed it present but aria-hidden="true"
    // tabindex="-1". So it resolves, it just is not visible.
    //
    // The `:visible` filter makes this land on whichever step is actually on
    // screen, rather than relying on DOM order to pick the right one.
    expect(page.url()).toContain('/login');
    await expect(page.locator('#username:visible, #password:visible').first())
      .toBeVisible();
  });

  test('TC007 — Invalid username should not login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginWithoutWait(users.invalid.username, users.invalid.password);
    expect(page.url()).not.toContain('/home/');
    expect(page.url()).toContain('/login');
    await expect(page.locator('#username:visible, #password:visible').first())
      .toBeVisible();
  });

});

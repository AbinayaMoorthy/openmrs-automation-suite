const { test, expect } = require('../fixtures/demoTest');
const { PatientPage } = require('../pages/PatientPage');
const { waitForNavbarAction } = require('../utils/appShell');
const { patients } = require('../test-data/testData');

test.describe('Module 3 — Patient Management Tests', () => {

  // No beforeEach login — session comes from storageState (global-setup.js)
  // and every test navigates to its own starting page.

  // ─────────────────────────────────────────────
  // PATIENT REGISTRATION TESTS
  // ─────────────────────────────────────────────

  test('TC017 @smoke — Patient registration page should load', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToRegistration();
    const isLoaded = await patientPage.isRegistrationPageLoaded();
    expect(isLoaded).toBeTruthy();
  });

  test('TC018 — Registration page URL should contain patient-registration', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToRegistration();
    expect(page.url()).toContain('patient-registration');
  });

  test('TC019 — First name field should be visible on registration form', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToRegistration();
    await expect(page.locator('#givenName').first()).toBeVisible();
  });

  test('TC020 — Last name field should be visible on registration form', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToRegistration();
    await expect(page.locator('#familyName').first()).toBeVisible();
  });

  test('TC021 — Registration form should have gender selection', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToRegistration();
    // Gender field — could be select, radio, or custom component
    const genderField = page.locator(
      'select[name*="gender"], input[name*="gender"], [data-testid*="gender"], label:has-text("Sex"), label:has-text("Gender")'
    ).first();
    await expect(genderField).toBeVisible();
  });

  test('TC022 — Add patient icon in navbar should navigate to registration', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToDashboard();

    // Was: an inline `header` wait plus [aria-label="Add patient"] with a flat
    // 30s budget — the same shape that made TC013 flake, and worse here
    // because this one CLICKS the icon rather than just asserting on it.
    // waitForNavbarAction adds reload-once recovery and matches on accessible
    // name, with data-tutorial-target="add-patient" as a locale-proof fallback.
    await patientPage.openRegistrationViaIcon();

    expect(page.url()).toContain('patient-registration');
  });

  // ─────────────────────────────────────────────
  // PATIENT SEARCH TESTS
  // ─────────────────────────────────────────────

  test('TC023 @smoke — Search icon should open patient search', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToDashboard();

    const searchIcon = await waitForNavbarAction(page, 'search');
    await searchIcon.click();

    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 30000 });
  });

  // TC024/TC025 were previously fake. Both counted
  //   '.omrs-search-result, [data-testid*="patient-search"], .patient-search-result-item'
  // which tools/inspect-patient-search.js confirmed matches 0 elements for a
  // hit query AND a no-match query. So the count was always 0, which made
  // TC024 (count >= 0) impossible to fail and TC025 (count === 0) pass for
  // entirely the wrong reason. Both now use locators verified against the
  // live build, and both can genuinely fail.

  test('TC024 — Searching existing patient name should return results', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToDashboard();
    await patientPage.searchPatientViaIcon(patients.search.existing);

    // Wait for an actual result row. Do not rely on waitForSearchSettled alone:
    // the empty state can render transiently while the query is still in
    // flight, and .or() resolves on whichever appears first — a race that
    // local runs win and CI runs lose.
    await expect(patientPage.searchResults.first()).toBeVisible({ timeout: 30000 });

    const count = await patientPage.getSearchResultCount();
    expect(count).toBeGreaterThan(0);

    // And the result is actually RELEVANT, not just present — a search for
    // "John" returning unrelated patients is a real defect that a bare count
    // would miss. (If demo data ever changes so that matches come back by
    // identifier rather than name, this is the line to revisit.)
    await expect(patientPage.searchResults.first())
      .toContainText(new RegExp(patients.search.existing, 'i'));

    // The empty state must NOT be showing at the same time.
    await expect(patientPage.searchEmptyState).toBeHidden();
  });

  test('TC025 — Searching non-existent patient should show no results', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToDashboard();
    await patientPage.searchPatientViaIcon(patients.search.nonExistent);

    // Zero rows AND the explicit empty-state message. Checking only the count
    // is what made the old version pass against a dead locator.
    expect(await patientPage.getSearchResultCount()).toBe(0);
    await expect(patientPage.searchEmptyState).toBeVisible();
  });

  test('TC026 — Search input should accept text input', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToDashboard();
    const searchInput = await patientPage.openSearchViaIcon();
    await searchInput.fill(patients.search.existing);
    const value = await searchInput.inputValue();
    expect(value).toBe(patients.search.existing);
  });

  // ─────────────────────────────────────────────
  // REGISTRATION FORM VALIDATION TESTS
  // ─────────────────────────────────────────────
  //
  // IDs are one clean sequence TC001-TC037, allocated in run order (login
  // 1-7, navigation 8-16, patient 17-28, appointment 29-37) with no gaps and
  // no duplicates. Safe to renumber because these IDs exist only in this
  // codebase — there is no external test case document to stay aligned with.

  test('TC027 — Registration form should have all required fields', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToRegistration();

    // Verify all 3 core fields exist — first name, last name, gender
    const firstName  = page.locator('#givenName').first();
    const lastName   = page.locator('#familyName').first();
    const genderField = page.locator(
      'select[name*="gender"], input[name*="gender"], label:has-text("Sex"), label:has-text("Gender")'
    ).first();

    await expect(firstName).toBeVisible();
    await expect(lastName).toBeVisible();
    await expect(genderField).toBeVisible();
  });

  test('TC028 — Registration form should accept text in name fields', async ({ page }) => {
    const patientPage = new PatientPage(page);
    await patientPage.goToRegistration();

    // Fill first name and verify value is accepted
    const firstNameInput = page.locator('#givenName').first();
    await firstNameInput.fill('Abinaya');
    const value = await firstNameInput.inputValue();
    expect(value).toBe('Abinaya');

    // Fill last name and verify
    const lastNameInput = page.locator('#familyName').first();
    await lastNameInput.fill('TestPatient');
    const lastValue = await lastNameInput.inputValue();
    expect(lastValue).toBe('TestPatient');
  });

});

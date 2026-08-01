const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './tests',

  // Raised from 120s. utils/appShell can spend up to 75s waiting for the shell,
  // reload, and spend another 75s — worst case 150s before any assertion runs.
  // The old 120s would have killed that recovery path mid-flight.
  timeout: 200000,

  expect: { timeout: 30000 },
  workers: 1,

  // 2 retries, not 1. test3 is a shared public server; a genuine outage window
  // can easily swallow two consecutive attempts.
  retries: 2,

  // Log in ONCE before the suite and save the session — see global-setup.js
  globalSetup: require.resolve('./global-setup'),

  reporter: [
    ['html', { outputFolder: 'reports', open: 'never' }],
    ['list']
  ],
  use: {
    baseURL: 'https://test3.openmrs.org/openmrs/spa',
    headless: false,

    // slowMo was 100ms on every action for every one of 37 tests — pure cost,
    // no stability benefit (Playwright already auto-waits). Demo mode only now.
    slowMo: process.env.DEMO ? Number(process.env.DEMO_SLOWMO || 1200) : 0,

    actionTimeout: 30000,
    navigationTimeout: 60000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Traces make the next O3 flake diagnosable in one pass instead of three.
    trace: 'retain-on-failure',

    channel: 'chrome',

    // Every test starts already logged in (login.test.js opts out)
    storageState: path.join(__dirname, '.auth', 'state.json'),
  },
});

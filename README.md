# OpenMRS O3 — Automation Suite

[![API Tests (Newman)](https://github.com/AbinayaMoorthy/openmrs-automation-suite/actions/workflows/api-tests.yml/badge.svg)](https://github.com/AbinayaMoorthy/openmrs-automation-suite/actions/workflows/api-tests.yml)

End-to-end **UI automation (Playwright)** and **REST API automation (Postman / Newman)** for the
[OpenMRS 3.x](https://openmrs.org) healthcare platform, running against the public OpenMRS demo
instances. The UI suite targets `test3.openmrs.org`; the API suite targets `dev3.openmrs.org` — see
[Target instances](#target-instances) for why they differ.

| | |
|---|---|
| **UI tests** | 37 test cases · 4 modules · Page Object Model |
| **API tests** | 20 requests · 79 assertions · chained UUIDs |
| **UI framework** | Playwright Test (JavaScript) |
| **API framework** | Postman collection v2.1 + Newman CLI |
| **UI target** | `https://test3.openmrs.org/openmrs/spa` |
| **API target** | `https://dev3.openmrs.org/openmrs/ws/rest/v1` |

---

## Table of contents

- [Why this suite exists](#why-this-suite-exists)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the UI tests](#running-the-ui-tests)
- [Running the API tests](#running-the-api-tests)
- [Test coverage](#test-coverage)
- [Architecture and design decisions](#architecture-and-design-decisions)
- [Environment variables](#environment-variables)
- [Inspector tools](#inspector-tools)
- [Troubleshooting](#troubleshooting)
- [Notes on the test server](#notes-on-the-test-server)

---

## Why this suite exists

OpenMRS O3 is a **single-spa microfrontend application** served from a shared, public QA server.
That combination breaks most naïve automation:

- `domcontentloaded` fires on a nearly empty `index.html` — the real UI arrives seconds later,
  after an import map plus dozens of JS bundles mount.
- The app polls continuously (session, FHIR, offline sync), so **`networkidle` never fires**.
- Every Playwright test gets a fresh browser context with an **empty HTTP cache**, so all 37 tests
  re-download the full bundle set from a server that other people are also hammering.

Measured cost of the *same* shell wait across a run: **9.9s on a good day, 46s on a bad one.**

This suite is built around that reality rather than fighting it. Waits are centralised, budgeted
above the observed worst case, and recover once on their own before failing — so a red result means
a real defect, not a slow server.

---

## Project structure

```
openmrs-automation-suite/
│
├── tests/                        # Playwright specs (37 cases, 4 modules)
│   ├── 01-login.test.js          #   TC001–TC007  Login & authentication
│   ├── 02-navigation.test.js     #   TC008–TC016  Navigation & dashboard
│   ├── 03-patient.test.js        #   TC017–TC028  Patient registration & search
│   └── 04-appointment.test.js    #   TC029–TC037  Appointment management
│
├── pages/                        # Page Object Model
│   ├── LoginPage.js              #   Two-step login + location selection
│   ├── NavigationPage.js         #   Sidebar rail + top navbar
│   ├── PatientPage.js            #   Registration form + patient search
│   └── AppointmentPage.js        #   Appointments module + booking workspace
│
├── utils/
│   └── appShell.js               # ★ Centralised microfrontend readiness waits
│
├── fixtures/
│   └── demoTest.js               # Opt-in presentation mode (DEMO=1)
│
├── test-data/
│   └── testData.js               # Users, patients, appointments, URLs
│
├── tools/                        # DOM inspectors (evidence, not guesswork)
│   ├── inspect-patient-search.js
│   └── inspect-appointment-form.js
│
├── postman/
│   ├── OpenMRS-REST-API-Suite.postman_collection.json
│   └── OpenMRS-Environment.postman_environment.json
│
├── global-setup.js               # Logs in once, saves session to .auth/state.json
├── playwright.config.js
└── package.json
```

Generated at runtime and **not committed**: `node_modules/`, `.auth/`, `test-results/`, `reports/`.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 18 or newer | `node -v` |
| npm | 9 or newer | `npm -v` |
| Google Chrome | any recent | tests use `channel: 'chrome'` |
| Newman | 6.x (for API tests) | `newman -v` |

---

## Installation

```bash
git clone https://github.com/AbinayaMoorthy/openmrs-automation-suite.git
cd openmrs-automation-suite

npm install
npx playwright install chrome
```

---

## Running the UI tests

```bash
npm test                    # full suite, all 37 cases
npm run test:headed         # full suite, visible browser
npm run test:smoke          # @smoke tagged cases only (fast sanity check)

npm run test:login          # Module 1 only
npm run test:nav            # Module 2 only
npm run test:patient        # Module 3 only
npm run test:appointment    # Module 4 only

npm run report              # open the Playwright HTML report
```

### Demo / presentation mode

Normal runs are fast and unattended, which makes them impossible to watch. `DEMO=1` slows each
action down and holds the final state of every test on screen with an on-screen test-ID badge:

```bash
# Windows CMD
set DEMO=1 && npm run demo
set DEMO=

# PowerShell
$env:DEMO=1; npm run demo
Remove-Item Env:DEMO

# macOS / Linux
DEMO=1 npm run demo
```

With `DEMO` unset this is a pure pass-through — no timing change, no DOM injection, byte-for-byte
identical behaviour.

---

## Running the API tests

The Postman collection can be run from the Postman app, or headlessly with Newman for CI and for
generating a shareable HTML report.

### 1. Install Newman

```bash
npm install --save-dev newman newman-reporter-htmlextra
```

### 2. Run the collection

```bash
npm run api:test
```

Which expands to:

```bash
newman run postman/OpenMRS-REST-API-Suite.postman_collection.json \
  -e postman/OpenMRS-Environment.postman_environment.json \
  --reporters cli,htmlextra,json \
  --reporter-htmlextra-export newman/openmrs-api-report.html \
  --reporter-json-export newman/openmrs-api-report.json \
  --delay-request 300
```

| Flag | Why |
|---|---|
| `-e` | Loads `baseUrl`, credentials and seed UUIDs |
| `--delay-request 300` | The demo server is shared; back-to-back requests can be throttled |
| `htmlextra` | Rich HTML report — per-request assertions, timings, failures |
| `json` | Machine-readable output for CI dashboards |

### 3. Read the report

```bash
# Windows
start newman\openmrs-api-report.html

# macOS
open newman/openmrs-api-report.html

# Linux
xdg-open newman/openmrs-api-report.html
```

The `htmlextra` report gives per-request assertion breakdowns, response bodies, timings and a
failure summary — the same information Postman's paid Reporting add-on produces, generated locally
and free.

Three reporters, three purposes:

| Output | Reporter | Used for |
|---|---|---|
| `newman/openmrs-api-report.html` | `htmlextra` | Human review; the artefact committed to this repo |
| `newman/openmrs-api-report.json` | `json` | Machine parsing, custom dashboards |
| `newman/openmrs-api-junit.xml` | `junit` | CI test-result panels (`npm run api:ci`) |

### Exit codes

`newman` exits non-zero if any assertion fails, which is what makes `api:ci` usable as a build gate.
That also means a failing run **stops before writing the report** in some shells. When the goal is
the report rather than the gate, use:

```bash
npm run api:report        # adds --suppress-exit-code; always writes the HTML
```

### Viewing the report on GitHub

GitHub renders `.html` files in a repository as source, not as a page. Two options:

1. **htmlpreview** — paste the file's GitHub URL into
   `https://htmlpreview.github.io/?<raw-file-url>`.
2. **GitHub Pages** — *Settings → Pages → Source: `main` / root*, then the report is served at
   `https://<user>.github.io/openmrs-automation-suite/newman/openmrs-api-report.html`.

### Running in CI

`.github/workflows/api-tests.yml` runs the collection on every push touching `postman/`, on pull
requests, weekly on a schedule, and on demand from the Actions tab. Reports upload as a build
artefact and JUnit results render in the run summary.

The job is marked `continue-on-error` on purpose: the OpenMRS demo instances are public and shared, so
an outage would otherwise paint the repository red for a reason that has nothing to do with the
tests. The report is still uploaded either way, which is where the actual verdict lives.

### Request order matters

The collection is **stateful and must run top to bottom**. Requests chain values through the
environment via `pm.environment.set()`:

```
TC001 Session         →  saves locationUuid, providerUuid, userUuid
TC006b idgen source   →  saves idgenSourceUuid
TC006c generate id    →  saves generatedPatientId
TC007 create patient  →  saves newPatientUuid       →  consumed by TC008
TC009b visit types    →  saves visitTypeUuid
TC010 create visit    →  saves visitUuid            →  consumed by TC011
```

Running a single request in isolation will fail on an empty variable. Run the whole collection.

---

## Test coverage

### Module 1 — Login & authentication (`01-login.test.js`)

| ID | Test | Tag |
|---|---|---|
| TC001 | Valid credentials should login successfully | `@smoke` |
| TC002 | Dashboard URL should contain `/home` after login | `@smoke` |
| TC003 | Login page title should be OpenMRS | |
| TC004 | Username field should be visible on login page | |
| TC005 | Continue button should appear after entering username | |
| TC006 | Invalid password should not login | *negative* |
| TC007 | Invalid username should not login | *negative* |

### Module 2 — Navigation & dashboard (`02-navigation.test.js`)

| ID | Test | Tag |
|---|---|---|
| TC008 | Dashboard should load after login | `@smoke` |
| TC009 | Service queues heading should be visible | |
| TC010 | Checked-in patients count should be visible | |
| TC011 | Patients currently in queue section should exist | |
| TC012 | All sidebar navigation links should be visible | `@smoke` |
| TC013 | Top navbar search icon should be visible | |
| TC014 | Top navbar add-patient icon should be visible | |
| TC015 | Clicking Appointments link should navigate correctly | |
| TC016 | Navigating back to service queues should work | |

### Module 3 — Patient management (`03-patient.test.js`)

| ID | Test | Tag |
|---|---|---|
| TC017 | Patient registration page should load | `@smoke` |
| TC018 | Registration URL should contain `patient-registration` | |
| TC019 | First name field should be visible | |
| TC020 | Last name field should be visible | |
| TC021 | Registration form should have gender selection | |
| TC022 | Add-patient navbar icon should navigate to registration | |
| TC023 | Search icon should open patient search | `@smoke` |
| TC024 | Searching an existing patient name should return results | |
| TC025 | Searching a non-existent patient should show no results | *negative* |
| TC026 | Search input should accept text input | |
| TC027 | Registration form should have all required fields | |
| TC028 | Registration form should accept text in name fields | |

### Module 4 — Appointment management (`04-appointment.test.js`)

| ID | Test | Tag |
|---|---|---|
| TC029 | Appointments page should load successfully | `@smoke` |
| TC030 | Appointments page URL should contain `appointments` | |
| TC031 | Appointments page should show heading | |
| TC032 | Add-appointment button should be visible | |
| TC033 | Scheduled appointments metric card should be visible | |
| TC034 | Appointments calendar button should be visible | |
| TC035 | Create-new-appointment form should open | |
| TC036 | Appointment form should have patient search field | |
| TC037 | Appointment form should be closeable | |

### API coverage (`postman/`)

| ID | Method | Endpoint | Assertions |
|---|---|---|---|
| TC001 | GET | `/session` — health check, saves UUIDs | 7 |
| TC002 | POST | `/session` — login | 4 |
| TC003 | DELETE | `/session` — logout | 3 |
| TC004 | GET | `/patient?q=John&v=default&limit=5` | 7 |
| TC005 | GET | `/patient?q=John` — search by name | 4 |
| TC006 | GET | `/patient/{uuid}?v=full` | 7 |
| TC006b | GET | `/idgen/identifiersource` | 2 |
| TC006c | POST | `/idgen/identifiersource/{uuid}/identifier` | 2 |
| TC007 | POST | `/patient` — create patient | 7 |
| TC008 | GET | `/patient/{newUuid}?v=full` — verify creation | 8 |
| TC009 | GET | `/visit?limit=10` | 2 |
| TC009b | GET | `/visittype` | 2 |
| TC010 | POST | `/visit` — create visit | 3 |
| TC011 | GET | `/visit/{uuid}?v=full` | 3 |
| TC012 | GET | `/location?v=default&limit=50` | 3 |
| TC013 | GET | `/provider?v=default&limit=50` | 4 |
| TC014 | GET | `/appointment/all?forDate=` | 3 |
| TC015 | GET | protected resource without auth — *negative* | 2 |
| TC016 | GET | `/patient/invaliduuid` — *negative* | 2 |
| TC017 | POST | `/patient` with invalid identifier — *negative* | 4 |
| | | **Total** | **79** |

Assertions cover status codes, response schema, business rules (identifier format, gender values,
voided flags), response-time SLAs, and negative-path error handling.

---

## Architecture and design decisions

### 1. Login happens once, not 37 times

`global-setup.js` logs in a single time before the suite, saves cookies to `.auth/state.json`, and
`playwright.config.js` injects that session into every test context via `storageState`. Only the
login module opts out with `test.use({ storageState: undefined })`.

The setup itself is hardened for a shared server: it pings the host first (so "server is down"
produces a *clear* message rather than 37 confusing failures), retries login up to 3 times with a
15s gap, and saves `.auth/setup-failure.png` on the last failure for diagnosis.

### 2. All readiness waits live in `utils/appShell.js`

Rather than scattering magic numbers, every "is the app usable yet?" wait routes through one module
with three properties:

1. **Budgets above the observed worst case**, not the average.
2. **Reload-once recovery** — a dropped bundle fetch on a cold context is common; a reload costs
   seconds, a Playwright retry costs a whole test.
3. **One env knob per layer**, so a bad server day is a flag, not a code change.

### 3. The `<header>` trap

`waitForAppShell()` waits for `<header>` — that is the *navigation shell* painting its own chrome.
The icons **inside** the navbar (search patient, add patient, user menu) are **separate extensions**,
each backed by its own bundle, mounting strictly *after* `<header>` exists and sometimes seconds
behind it.

So "the shell is up" does **not** mean "the navbar icons exist." Four separate layers hit this same
trap during development, and each now gets its own budget and its own error message:

| Layer | Wait | Default budget |
|---|---|---|
| App shell (`<header>`) | `waitForAppShell` | 75s |
| Navbar extension icons | `waitForNavbarAction` | 45s |
| Left sidebar rail | `waitForSidebarRail` | 45s |
| Module content | `waitForModuleContent` | 45s |

### 4. No `networkidle`, anywhere

O3 polls constantly, so `waitForLoadState('networkidle')` hangs until the test timeout. Every wait
targets a URL or an element instead.

### 5. No swallowed waits

An earlier revision used `.catch(() => {})` around readiness waits. TC015 is what that cost: the
sidebar rail hadn't mounted, a 30s wait expired **in silence**, and the *next* line failed 30s later
blaming `appointmentsLink` — a locator that was never the problem. Waits now report their own
failures instead of handing the blame downstream.

### 6. Locators built on evidence, not guesses

`PatientPage.searchResults` was originally
`.omrs-search-result, [data-testid*="patient-search"], .patient-search-result-item` — class names
that were guessed and never confirmed. They matched **zero** elements, which made TC024 (`count >= 0`)
unable to fail and TC025 (`count === 0`) pass for entirely the wrong reason.

The `tools/` inspectors exist so replacements come from the real DOM. See
[Inspector tools](#inspector-tools).

### 7. Navbar locators tolerate i18n

Deliberately **not** `[aria-label="Search patient"]`. That exact-match attribute selector is one
translation string or one capital letter away from silently matching nothing — and "matches nothing"
is indistinguishable from "hasn't loaded yet" in a timeout error. Instead:

```js
header.getByRole('button', { name: /search\s*patient/i })
  .or(header.locator('[aria-label*="search patient" i]'))
  .or(header.locator('[data-tutorial-target="add-patient"]'))   // survives locale changes
```

### 8. One deliberate fixed wait

`loginWithoutWait()` keeps a 5s settle, on purpose. Proving a **negative** has no "it appeared"
event to wait for — we're checking a redirect *never* happens, so the app must be given a fair
chance to perform one. Note the failure direction: too short risks a **false pass**, so the wait is
generous rather than tight, and callers additionally assert we're still on the login step.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OMRS_SHELL_TIMEOUT` | `75000` | App shell (`<header>`) mount budget |
| `OMRS_CONTENT_TIMEOUT` | `45000` | Module content budget after shell is up |
| `OMRS_NAVBAR_TIMEOUT` | `45000` | Navbar extension icon budget |
| `OMRS_RAIL_TIMEOUT` | `45000` | Left sidebar rail budget |
| `DEMO` | unset | Enables presentation mode |
| `DEMO_SLOWMO` | `1200` | ms between actions in demo mode |
| `DEMO_HOLD` | `2500` | ms to hold final state per test |
| `DEMO_BADGE` | `1` | Set to `0` to disable the on-screen badge |

Example — a slow server day:

```bash
# macOS / Linux
OMRS_SHELL_TIMEOUT=120000 npm test

# Windows CMD
set OMRS_SHELL_TIMEOUT=120000 && npm test
```

---

## Inspector tools

Standalone scripts that open the real application and dump the actual DOM around a feature, so
locators are written from evidence instead of assumption.

```bash
npm run inspect:patient-search      # dumps DOM around patient search results
npm run inspect:appointment-form    # dumps DOM around the booking workspace
```

Both require `.auth/state.json`, so run `npm test` at least once first.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Global setup failed after 3 attempts` | The demo instance is down or rebuilding | Check `.auth/setup-failure.png`; see [talk.openmrs.org](https://talk.openmrs.org) |
| `OpenMRS app shell never mounted` | Server slow, not a test defect | `OMRS_SHELL_TIMEOUT=120000 npm test` |
| `navbar mounted but "search" icon never appeared` | Slow bundle **or** changed accessible name | Open the trace — it tells you which. Then raise `OMRS_NAVBAR_TIMEOUT` or update `NAVBAR_ACTIONS` |
| Newman: `Cannot read property of undefined` | Ran one request in isolation | The collection is stateful — run it top to bottom |
| Newman: `401 Unauthorized` | Demo credentials rotated | Update `username` / `password` in the environment file |
| Health check logs HTTP 403 | Bot protection blocking the bare HTTP probe | Advisory only — the real browser login proceeds |

Failed runs capture screenshots, video and a Playwright trace:

```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```

---

## Notes on the test server

### Target instances

This suite runs against two different OpenMRS demo instances, on purpose.

| Suite | Instance | Reason |
|---|---|---|
| Playwright (UI) | `test3.openmrs.org` | Drives real Chromium, so it passes bot protection |
| Postman / Newman (API) | `dev3.openmrs.org` | Newman cannot pass test3's bot protection |

`test3.openmrs.org` sits behind Cloudflare bot protection. Requests from a browser are challenged,
solve the challenge transparently, and succeed. Requests from Newman are challenged and cannot
respond, so every call returns an HTTP 403 challenge page instead of JSON — the collection passes
in the Postman desktop app but fails completely under Newman.

Setting a browser `User-Agent` header on every request was tried first and did not help: Cloudflare
also fingerprints the TLS handshake, and Node's handshake differs from a browser's regardless of
what headers are sent. `dev3.openmrs.org` serves the same OpenMRS reference dataset without that
restriction, so the API suite points there.

Both instances are **public, shared OpenMRS demo servers**. They are rebuilt around release
candidates, go down without notice, and are used by many people at once.

Two consequences worth stating plainly:

1. **Credentials are public demo credentials** (`admin` / `Admin123`), published in OpenMRS
   documentation. They are not secrets. No real patient data exists on this server — everything is
   synthetic demo data.
2. **A failing run is not automatically a test defect.** The suite is deliberately built to
   distinguish the two: server problems produce explicit, named error messages pointing at the
   server; locator problems point at the locator.

`retries: 2` is set for the same reason — a genuine outage window can easily swallow two
consecutive attempts.

---

## Author

**Abinaya Moorthy** — QA Engineer
Manual testing · API automation · UI automation · Performance testing

---

*Built as a portfolio project against the public OpenMRS demo instance.*

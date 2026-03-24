# MediCheck System — Test Suite Documentation

> **Stack:** Node.js · TypeScript · Jest 29 · ts-jest · Supertest  
> **Total tests:** 140 · **Suites:** 6 · **Pass rate:** 100 %

---

## Table of Contents

1. [Overview](#1-overview)
2. [Testing Philosophy](#2-testing-philosophy)
3. [Prerequisites](#3-prerequisites)
4. [Project Structure](#4-project-structure)
5. [Test Architecture](#5-test-architecture)
   - 5.1 [Unit Tests](#51-unit-tests)
   - 5.2 [Integration Tests](#52-integration-tests)
   - 5.3 [Expert-System Validation Tests](#53-expert-system-validation-tests)
6. [Running the Tests](#6-running-the-tests)
7. [Test Coverage](#7-test-coverage)
8. [What Every Test Covers](#8-what-every-test-covers)
   - 8.1 [prologBridge.test.ts](#81-prologbridgetestts--21-tests)
   - 8.2 [diagnosisService.test.ts](#82-diagnosisservicetestts--29-tests)
   - 8.3 [diagnosis.route.test.ts](#83-diagnosisroutetestts--25-tests)
   - 8.4 [history.route.test.ts](#84-historyroutetestts--14-tests)
   - 8.5 [symptoms.route.test.ts](#85-symptomsroutetestts--15-tests)
   - 8.6 [inference.test.ts](#86-inferencetestts--34-tests)
9. [Mocking Strategy](#9-mocking-strategy)
10. [Expert-System Rule Coverage Matrix](#10-expert-system-rule-coverage-matrix)
11. [Environment Variables for Testing](#11-environment-variables-for-testing)
12. [Continuous Integration](#12-continuous-integration)
13. [Writing New Tests](#13-writing-new-tests)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Overview

The MediCheck test suite provides **three layers of automated testing** that together verify every behavioural contract of the backend — from low-level module logic through HTTP routing up to the live Prolog inference engine.

| Layer | Suite | Tests | Needs DB | Needs swipl |
|---|---|---|---|---|
| Unit | `prologBridge.test.ts` | 21 | ✗ | ✗ |
| Unit | `diagnosisService.test.ts` | 29 | ✗ | ✗ |
| Integration | `diagnosis.route.test.ts` | 25 | ✗ | ✗ |
| Integration | `history.route.test.ts` | 14 | ✗ | ✗ |
| Integration | `symptoms.route.test.ts` | 15 | ✗ | ✗ |
| Expert-System | `inference.test.ts` | 34 | ✗ | ✓ |
| **Total** | | **140** | | |

Unit and integration tests run entirely in memory — no database, no SWI-Prolog installation is required. The expert-system tests are the only suite that spawns a real `swipl` process; they auto-skip with a clear message when SWI-Prolog is not found.

---

## 2. Testing Philosophy

### The Testing Pyramid

```
        /\
       /  \
      / E2E\          ← not in scope (frontend)
     /──────\
    /  Expert \       ← src/tests/expert-system/  (34 tests)
   /  System   \        real swipl · no mocks
  /─────────────\
 / Integration   \    ← src/tests/integration/    (54 tests)
/   (HTTP layer)  \     real Express · mocked service
/──────────────────\
      Unit           ← src/tests/unit/            (50 tests)
  (pure logic)         all I/O mocked
```

### Key Principles

- **Fast feedback first.** Unit tests mock every I/O boundary (database, child process, UUID). They run in under 5 seconds and are the first thing you run during active development.
- **Test behaviour, not implementation.** Tests assert on observable inputs and outputs — HTTP status codes, response shapes, Prolog diagnosis results — not on internal variable names or call order (except where call order *is* the behaviour being tested).
- **No test should depend on another.** Every test is fully self-contained. `beforeEach` resets all mocks. No shared mutable state leaks between tests.
- **Failures must be obvious.** Assertion messages, mock factory names, and test descriptions are written so that a failing test tells you *what* broke and *why* without reading the source.
- **Expert-system tests prove the knowledge base.** The inference tests exist to catch regressions in Prolog rules, not to test Node.js. They bypass all TypeScript mocking and hit the real `swipl` binary.

---

## 3. Prerequisites

### For Unit and Integration Tests (no external dependencies)

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | Tested on v20 LTS |
| pnpm | ≥ 9 | `npm install -g pnpm` |

### For Expert-System Tests (requires SWI-Prolog)

| Requirement | Version | Install |
|---|---|---|
| SWI-Prolog | ≥ 9.0 | [swi-prolog.org/Download.html](https://www.swi-prolog.org/Download.html) |

**Windows note:** The test suite automatically probes `C:\Program Files\swipl\bin\swipl.exe` as a fallback if `swipl` is not on `PATH`. No manual PATH configuration is needed as long as SWI-Prolog was installed to its default location.

Verify SWI-Prolog is available:

```bash
swipl --version
# SWI-Prolog version 10.x.x for x64-win64
```

### Installing Test Dependencies

All test dependencies (`jest`, `ts-jest`, `supertest`, `@types/jest`, `@types/supertest`) are declared as `devDependencies` and are installed with the normal install command:

```bash
pnpm install
```

---

## 4. Project Structure

```
Medicheck-system/
├── jest.config.ts                   # Jest configuration
├── src/
│   ├── config/
│   │   └── db.ts                    # pg Pool (mocked in tests)
│   ├── routes/
│   │   ├── diagnosis.ts
│   │   ├── history.ts
│   │   └── symptoms.ts
│   ├── services/
│   │   ├── diagnosisService.ts      # Business logic
│   │   └── prologBridge.ts          # Node ↔ swipl IPC
│   ├── types/
│   │   └── index.ts                 # Shared TypeScript interfaces
│   └── tests/
│       ├── setup/
│       │   └── jest.setup.ts        # Global setup: env vars, mock cleanup
│       ├── helpers/
│       │   └── mockFactory.ts       # Shared typed test-data factories
│       ├── unit/
│       │   ├── prologBridge.test.ts
│       │   └── diagnosisService.test.ts
│       ├── integration/
│       │   ├── diagnosis.route.test.ts
│       │   ├── history.route.test.ts
│       │   └── symptoms.route.test.ts
│       └── expert-system/
│           └── inference.test.ts
└── prolog/
    ├── bridge.pl
    ├── inference_engine.pl
    └── knowledge_base.pl
```

---

## 5. Test Architecture

### 5.1 Unit Tests

**Location:** `src/tests/unit/`

Unit tests isolate a single module and mock every external dependency. No network calls, no child processes, no database connections are made.

**Mocking boundaries:**

```
┌─────────────────────────────────────┐
│  prologBridge.test.ts               │
│                                     │
│  SUT: runPrologInference()          │
│  Mocked: child_process.spawn        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  diagnosisService.test.ts           │
│                                     │
│  SUT: runDiagnosis()                │
│       getHistory()                  │
│       getSymptoms()                 │
│  Mocked: pg Pool.query              │
│          runPrologInference         │
│          uuid.v4                    │
└─────────────────────────────────────┘
```

### 5.2 Integration Tests

**Location:** `src/tests/integration/`

Integration tests verify the HTTP layer — routing logic, request validation, response shape, and error handling — using a real Express application mounted with `supertest`. The service layer is mocked so no real database or Prolog process is involved.

Each test file creates its own minimal Express app containing only the router under test. This keeps tests focused and avoids importing `server.ts` (which calls `app.listen()`).

```typescript
// Pattern used in every integration test file
const app = express();
app.use(express.json());
app.use('/api/diagnosis', diagnosisRouter);
```

### 5.3 Expert-System Validation Tests

**Location:** `src/tests/expert-system/`

These tests use **no mocks at all**. Every test calls `runPrologInference()` which spawns a real `swipl` subprocess, loads `prolog/bridge.pl`, `prolog/knowledge_base.pl`, and `prolog/inference_engine.pl`, runs the forward-chaining algorithm, and returns the result.

Their purpose is to act as a **regression suite for the Prolog knowledge base**. If someone changes a rule threshold, an exclusion condition, or an advice string, these tests will catch it immediately.

**Auto-skip behaviour:** At the top of the file, a synchronous `execSync` probes for `swipl` before any tests run. If it cannot be found (on PATH or at the default Windows install location), every test in the file is marked as `skipped` — not `failed`. This means the suite still passes on machines without SWI-Prolog installed, which is important for CI environments that may only run unit and integration tests.

---

## 6. Running the Tests

### Run Everything

```bash
pnpm test
```

Runs all 6 suites (140 tests). This is the command to use before committing or pushing.

---

### Run a Specific Layer

```bash
# Unit tests only — fastest, no external dependencies
pnpm test:unit

# Integration (HTTP) tests only — no external dependencies
pnpm test:integration

# Expert-system tests only — requires SWI-Prolog
pnpm test:expert
```

---

### Generate a Coverage Report

```bash
pnpm test:coverage
```

Runs all tests and writes three coverage formats to `coverage/`:

| Format | Location | Use |
|---|---|---|
| Terminal summary | stdout | Quick glance |
| LCOV | `coverage/lcov.info` | CI/CD pipeline upload |
| HTML report | `coverage/index.html` | Open in browser for line-by-line view |

Open the HTML report:

```bash
# Windows
start coverage/index.html

# macOS
open coverage/index.html

# Linux
xdg-open coverage/index.html
```

---

### Watch Mode (during development)

```bash
pnpm test:watch
```

Re-runs only the test files affected by your last file change. Use this while actively writing code.

---

### Run a Single Test File

```bash
# Using the Jest binary directly via pnpm dlx
pnpm jest src/tests/unit/prologBridge.test.ts

# Or with a name filter to run one specific test
pnpm jest --testNamePattern="malaria_high fires"
```

---

### Run Tests with Verbose Output

```bash
pnpm jest --verbose
```

All commands above already use `--verbose` by default (configured in `jest.config.ts`).

---

## 7. Test Coverage

### Thresholds

The following minimum coverage thresholds are enforced in `jest.config.ts`. The build will fail if any threshold is not met:

| Metric | Threshold |
|---|---|
| Statements | 85 % |
| Lines | 85 % |
| Functions | 85 % |
| Branches | 75 % |

### What Is Excluded from Coverage

| Path | Reason |
|---|---|
| `src/tests/**` | Test files themselves |
| `src/scripts/**` | One-off DB init script, not application logic |
| `src/server.ts` | Entry point — only calls `app.listen()` |

### Typical Coverage Output

```
--------------------------|---------|----------|---------|---------|
File                      | % Stmts | % Branch | % Funcs | % Lines |
--------------------------|---------|----------|---------|---------|
src/config/db.ts          |   100   |   100    |   100   |   100   |
src/routes/diagnosis.ts   |   100   |   100    |   100   |   100   |
src/routes/history.ts     |   100   |   100    |   100   |   100   |
src/routes/symptoms.ts    |   100   |   100    |   100   |   100   |
src/services/             |         |          |         |         |
  diagnosisService.ts     |   100   |   100    |   100   |   100   |
  prologBridge.ts         |    97   |    92    |   100   |    97   |
src/types/index.ts        |   100   |   100    |   100   |   100   |
--------------------------|---------|----------|---------|---------|
All files                 |    99   |    97    |   100   |    99   |
```

---

## 8. What Every Test Covers

### 8.1 `prologBridge.test.ts` — 21 tests

Tests the Node ↔ SWI-Prolog IPC bridge in `src/services/prologBridge.ts`. `child_process.spawn` is fully mocked — no real `swipl` process is started.

#### Successful Inference (9 tests)

| Test | What it verifies |
|---|---|
| Resolves with parsed PrologResult on clean JSON | Happy path — stdout contains a single JSON line |
| Extracts JSON when Prolog prints warnings before it | `extractLastJsonLine` scans from the bottom up |
| Picks the LAST JSON line when multiple fragments appear | Last-line-wins extraction strategy |
| Uses `"unknown"` as default duration when omitted | Default parameter behaviour |
| Passes `--symptoms` as comma-separated string | Correct CLI argument construction |
| Passes `symptom_duration` to swipl | Duration forwarded as `--duration` flag |
| Resolves when exit code is non-zero but stdout has JSON | Prolog warnings path (non-zero exit is non-fatal) |
| Does not reject when `error` field is string `"null"` | Bridge tolerates Prolog's null-as-string output |
| Resolves with fallback result when no rules fire | Confidence `"none"` passes through correctly |

#### Failure / Rejection Paths (8 tests)

| Test | What it verifies |
|---|---|
| Non-zero exit + empty stdout → rejects with stderr | Critical failure path |
| Non-zero exit + empty stdout + empty stderr → generic message | Fallback error message |
| No JSON object in stdout → rejects | Corrupted output guard |
| Malformed JSON → rejects | Parse error guard |
| `error` field is non-null string → rejects | Prolog-level error propagation |
| ENOENT spawn error → rejects with install hint | Developer-friendly message when swipl missing |
| Other spawn error → rejects with generic message | Generic OS error path |
| Process hangs past 15 s → kills with SIGKILL and rejects | Timeout guard |

#### Argument / Edge Cases (4 tests)

| Test | What it verifies |
|---|---|
| Single symptom has no trailing comma | `join(',')` edge case |
| `less_than_2_weeks` duration passed correctly | Duration enum forwarding |
| stdio configured as `['ignore', 'pipe', 'pipe']` | stdin suppressed, stdout/stderr captured |
| Base args include `-g main -t halt` | Correct swipl invocation flags |

---

### 8.2 `diagnosisService.test.ts` — 29 tests

Tests the three exported service functions. All external I/O (`pg.Pool`, `runPrologInference`, `uuid.v4`) is mocked.

#### `runDiagnosis` (16 tests)

| Test | What it verifies |
|---|---|
| Returns complete DiagnosisResponse on happy path | Full output shape |
| Uses DB-generated `id` as `diagnosis_id` | DB row mapping |
| Auto-generates UUID when `session_id` omitted | `uuidv4()` is called |
| Uses caller-supplied `session_id` without calling uuidv4 | UUID passthrough |
| Defaults `symptom_duration` to `"unknown"` | Default parameter |
| Passes caller-supplied duration to Prolog | Duration forwarding |
| Converts uppercase symptoms to lowercase | Sanitisation step 1 |
| Replaces spaces with underscores | Sanitisation step 2 |
| Trims leading/trailing whitespace | Sanitisation step 3 |
| Applies all sanitisation steps together | Combined sanitisation |
| Sanitised symptoms appear in `symptoms_submitted` | Response reflects cleaned input |
| Persists all 8 fields to DB with correct values | INSERT params verified |
| Throws when `symptoms` is empty array | Service-level guard |
| Propagates Prolog bridge errors | Error passthrough |
| Propagates database errors | Error passthrough |
| Works with fallback (confidence `"none"`) result | No special-casing of fallback |

#### `getHistory` (6 tests)

| Test | What it verifies |
|---|---|
| Returns correct `session_id` and `count` | Envelope fields |
| Maps `row.id` → `diagnosis_id` | Column alias |
| Returns `count: 0` and `[]` for unknown session | Empty result handling |
| Returns multiple diagnoses with correct count | Array mapping |
| Queries DB with correct `sessionId` parameter | SQL param injection check |
| Propagates database errors | Error passthrough |

#### `getSymptoms` (8 tests)

| Test | What it verifies |
|---|---|
| Returns all 22 symptoms in `all_symptoms` | Catalog completeness |
| Groups into correct disease categories | Grouping logic |
| Malaria category has all 7 symptoms | Category content |
| `all_symptoms` entries have `name`, `display_name`, `category` | Full shape check |
| Category entries do not have a `category` field | Shape distinction |
| Empty catalog → empty response | Edge case |
| New disease category created automatically | Dynamic key creation |
| Propagates database errors | Error passthrough |

---

### 8.3 `diagnosis.route.test.ts` — 25 tests

Tests `POST /api/diagnosis`. The `diagnosisService` module is fully mocked; a minimal Express app is used.

#### 400 — Validation Failures (12 tests)

| Input | Expected error |
|---|---|
| `symptoms` field missing entirely | `symptoms is required` |
| `symptoms` is a string | must be array |
| `symptoms` is a number | must be array |
| `symptoms` is `null` | must be array |
| `symptoms` is `[]` (empty array) | `non-empty array` |
| Array contains an empty string `""` | `non-empty strings` |
| Array contains a whitespace-only string `"   "` | `non-empty strings` |
| Array contains a number element | `non-empty strings` |
| Array contains a boolean element | `non-empty strings` |
| Array contains an object element | `non-empty strings` |
| `symptom_duration` is unrecognised value | `must be one of` |
| Invalid input → `runDiagnosis` not called | Service not invoked on bad input |

#### 200 — Successful Responses (11 tests)

| Scenario | What is verified |
|---|---|
| Valid symptoms array | Status 200 |
| Single-element array | Single symptom accepted |
| `symptom_duration: "less_than_2_weeks"` | Valid duration accepted |
| `symptom_duration: "more_than_2_weeks"` | Valid duration accepted |
| `symptom_duration: "unknown"` | Valid duration accepted |
| No `symptom_duration` field | Optional field |
| With `session_id` provided | Returned in response |
| Without `session_id` | One generated in response |
| All fields passed through to `runDiagnosis` | Service called with correct args |
| Full response shape returned | All 10 response fields present |
| `Content-Type: application/json` | Correct MIME type |

#### 500 — Service Errors (3 tests)

| Scenario | What is verified |
|---|---|
| Service throws `Error` | Status 500, `error` field |
| Service throws with swipl message | `detail` contains message |
| Service throws a plain string | `error` and `detail` both present |

---

### 8.4 `history.route.test.ts` — 14 tests

Tests `GET /api/history/:sessionId`. The `diagnosisService` module is fully mocked.

#### 200 — Successful Responses (6 tests)

| Scenario | What is verified |
|---|---|
| Valid UUID with 2 diagnoses | `count: 2`, array length 2 |
| Valid UUID with no diagnoses | `count: 0`, empty array |
| Diagnosis shape contains all 10 required fields | Full shape contract |
| Uppercase UUID letters accepted | Case-insensitive regex |
| `sessionId` forwarded to `getHistory` | Param passthrough |
| Multiple diagnoses preserve order | Array order maintained |

#### 400 — UUID Validation (6 tests)

| Input | Why it should fail |
|---|---|
| `not-a-uuid` | Not UUID format |
| `1234567890` | Numeric string |
| `a1b2c3d4-e5f6-7890-abcd` | Only 4 segments (truncated) |
| `...ef12345678901234` | Last segment too long |
| `zzzz-zzzz-...` | Non-hex characters |
| Invalid UUID → `getHistory` not called | Service not invoked on bad input |

#### 500 — Service Errors (2 tests)

| Scenario | What is verified |
|---|---|
| Service throws | Status 500, `error` field |
| Error message in `detail` | Full error message surfaced |

---

### 8.5 `symptoms.route.test.ts` — 15 tests

Tests `GET /api/symptoms`. The `diagnosisService` module is fully mocked.

| Test | What is verified |
|---|---|
| Returns HTTP 200 | Status code |
| `Content-Type: application/json` | Correct MIME type |
| Body has `categories` object and `all_symptoms` array | Top-level shape |
| `categories` has keys for all 3 diseases | Disease grouping |
| `all_symptoms` has 22 entries | Catalog completeness |
| Every `all_symptoms` entry has `name`, `display_name`, `category` | Full flat shape |
| Category entries have `name` and `display_name` only | Grouped shape (no `category` field) |
| Malaria category contains all 7 symptoms | Category content |
| Diarrhoea category contains all 7 symptoms | Category content |
| HIV/AIDS category contains all 8 symptoms | Category content |
| Empty catalog → 200 with empty response | Edge case |
| Service throws → 500 | Error status |
| 500 body has `error` field | Error envelope |
| 500 body has `detail` field with message | Error detail |
| Single-symptom catalog handled correctly | Minimal data edge case |

---

### 8.6 `inference.test.ts` — 34 tests

These tests use the **real SWI-Prolog binary**. No mocking. Each test calls `runPrologInference()` directly and asserts on the returned `PrologResult`.

#### Malaria Rules (7 tests)

| Symptoms Submitted | Duration | Expected Diagnosis | Expected Confidence | Rule |
|---|---|---|---|---|
| fever, chills, headache, sweating, muscle_pain | any | malaria | HIGH | `malaria_high` |
| fever, chills, nausea, vomiting | any | malaria | MEDIUM | `malaria_medium` |
| fever, chills, sweating, headache | any | malaria | POSSIBLE | `malaria_possible` |
| fever, headache, sweating, muscle_pain *(no chills)* | any | fallback | — | exclusion rule |
| fever+chills+headache+sweating+muscle_pain+nausea+vomiting | any | malaria | HIGH | HIGH wins over MEDIUM |
| fever, chills, headache, sweating, muscle_pain | any | all 5 in matched_symptoms | — | matched symptom check |
| fever, chills, headache, sweating, muscle_pain | any | reasoning contains "malaria" + "malaria_high" | — | reasoning string |

#### Diarrhoea Rules (4 tests)

| Symptoms Submitted | Duration | Expected Diagnosis | Expected Confidence | Rule |
|---|---|---|---|---|
| loose_stools, stomach_cramps, dehydration | any | diarrhoea | HIGH | `diarrhoea_high` |
| loose_stools, abdominal_pain, nausea | any | diarrhoea | MEDIUM | `diarrhoea_medium` |
| loose_stools, loss_of_appetite, bloating | any | diarrhoea | POSSIBLE | `diarrhoea_possible` |
| stomach_cramps, nausea, dehydration *(no loose_stools)* | any | fallback | — | exclusion rule |

#### HIV/AIDS Rules (6 tests)

| Symptoms Submitted | Duration | Expected Diagnosis | Expected Confidence | Rule |
|---|---|---|---|---|
| weight_loss, persistent_fatigue, night_sweats, swollen_lymph_nodes | more_than_2_weeks | HIV/AIDS | HIGH | `hiv_high` |
| recurring_fever, persistent_fatigue, swollen_lymph_nodes, weight_loss | more_than_2_weeks | HIV/AIDS | MEDIUM | `hiv_medium` |
| oral_thrush, weight_loss, night_sweats | more_than_2_weeks | HIV/AIDS | POSSIBLE | `hiv_possible` |
| weight_loss, persistent_fatigue, night_sweats, swollen_lymph_nodes | less_than_2_weeks | fallback | — | duration exclusion |
| weight_loss, persistent_fatigue, night_sweats, swollen_lymph_nodes | unknown | HIV/AIDS | HIGH | unknown not excluded |
| hiv_high symptoms | more_than_2_weeks | advice contains "URGENT" | — | advice string |

#### Fallback (4 tests)

| Scenario | What is verified |
|---|---|
| `bloating` alone | Fallback (diarrhoea excluded — no loose_stools) |
| Unknown symptom atom | Fallback returned safely |
| Fallback advice contains "consult" | Correct advice string |
| Fallback reasoning contains "no diagnostic rules" | Correct reasoning string |

#### Response Structure Invariants (8 tests)

Runs the shape contract `assertResultShape()` against 5 different scenarios (malaria HIGH, malaria MEDIUM, diarrhoea HIGH, HIV/AIDS HIGH, fallback), plus:

- `rules_fired` is always an array of strings
- `matched_symptoms` is always an array of strings
- `confidence` is always one of `high | medium | possible | none`

#### Edge Cases (5 tests)

| Scenario | What is verified |
|---|---|
| Duplicate symptom atoms in input | Deduplicated — `malaria_high` still fires |
| Unknown atom alongside valid symptoms | Ignored — diagnosis unaffected |
| Two diseases both fire MEDIUM rules | First disease in knowledge base wins (malaria before diarrhoea) |
| HIV symptoms with `unknown` duration | Not excluded — diagnosis returned |
| All 22 known symptoms submitted at once | No crash; at least one rule fires |

---

## 9. Mocking Strategy

### How `child_process.spawn` Is Mocked

```
jest.mock('child_process')
  │
  └─► mockSpawn.mockReturnValue(proc)
        │
        ├── proc.stdout  (EventEmitter)
        ├── proc.stderr  (EventEmitter)
        └── proc.kill    (jest.fn())

simulateProlog(proc, stdout, exitCode, stderr)
  └─► Promise.resolve().then(() => {
        proc.stdout.emit('data', Buffer.from(stdout));
        proc.stderr.emit('data', Buffer.from(stderr));
        proc.emit('close', exitCode);
      })
```

Events are emitted asynchronously (microtask tick) so that all `.on()` handlers in `prologBridge.ts` are registered before any events fire.

### How the Database Is Mocked

```typescript
jest.mock('../../config/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

// In each test:
(pool.query as jest.Mock).mockResolvedValue({ rows: [...] });
```

The mock replaces the entire `pg.Pool` instance. Because `jest.resetAllMocks()` runs in `afterEach`, every test must set up its own return value explicitly — there is no shared state.

### Mock Factory Helpers (`src/tests/helpers/mockFactory.ts`)

All test data is created through typed factory functions rather than raw object literals. This ensures:

- Tests remain readable when the underlying types change
- Partial overrides are supported via spread (`{ ...defaults, ...overrides }`)
- Data is consistent and realistic across all test files

| Factory | Returns |
|---|---|
| `makePrologResult(overrides?)` | `PrologResult` (malaria HIGH by default) |
| `makeFallbackPrologResult()` | `PrologResult` with `confidence: 'none'` |
| `makeDiarrhoeaPrologResult(overrides?)` | `PrologResult` for diarrhoea HIGH |
| `makeHivPrologResult(overrides?)` | `PrologResult` for HIV/AIDS HIGH |
| `makeDiagnosisResponse(overrides?)` | `DiagnosisResponse` (API response shape) |
| `makeDbDiagnosisRow(overrides?)` | Raw pg row from `diagnoses` table |
| `makeSymptomCatalogRow(overrides?)` | Raw pg row from `symptoms_catalog` table |
| `makeFullSymptomCatalog()` | All 22 symptom rows |
| `createMockProcess()` | `MockChildProcess` (EventEmitter + kill mock) |
| `simulateProlog(proc, stdout, code?, stderr?)` | Emits stdout/close asynchronously |
| `simulatePrologError(proc, error)` | Emits error event asynchronously |

---

## 10. Expert-System Rule Coverage Matrix

The table below maps every rule and exclusion in the Prolog knowledge base to the test(s) that cover it.

| Rule / Exclusion | Test file | Test description |
|---|---|---|
| `malaria_high` | `inference.test.ts` | malaria_high fires when all 5 symptoms present |
| `malaria_medium` | `inference.test.ts` | malaria_medium fires with fever+chills+nausea+vomiting |
| `malaria_possible` | `inference.test.ts` | malaria_possible fires with fever+chills+sweating+headache |
| `exclusion_rule(malaria, chills)` | `inference.test.ts` | malaria EXCLUDED when chills absent |
| `diarrhoea_high` | `inference.test.ts` | diarrhoea_high fires with 3 key symptoms |
| `diarrhoea_medium` | `inference.test.ts` | diarrhoea_medium fires with 3 symptoms |
| `diarrhoea_possible` | `inference.test.ts` | diarrhoea_possible fires with 3 symptoms |
| `exclusion_rule(diarrhoea, loose_stools)` | `inference.test.ts` | diarrhoea EXCLUDED when loose_stools absent |
| `hiv_high` | `inference.test.ts` | hiv_high fires with 4 key symptoms + >2 weeks |
| `hiv_medium` | `inference.test.ts` | hiv_medium fires with 4 symptoms + >2 weeks |
| `hiv_possible` | `inference.test.ts` | hiv_possible fires with 3 symptoms + >2 weeks |
| `excluded('HIV/AIDS', _, less_than_2_weeks)` | `inference.test.ts` | HIV/AIDS EXCLUDED when duration < 2 weeks |
| Fallback (no rules match) | `inference.test.ts` | bloating alone → fallback |
| `advice(malaria-high, ...)` | `prologBridge.test.ts` | advice text returned in PrologResult |
| `advice('HIV/AIDS'-high, ...)` | `inference.test.ts` | HIV/AIDS HIGH advice contains "URGENT" |
| `select_best_diagnosis` priority | `inference.test.ts` | HIGH beats MEDIUM when both fire |
| `select_best_diagnosis` tie-breaking | `inference.test.ts` | First disease in rule order wins on tie |
| `list_to_set` deduplication | `inference.test.ts` | Duplicate symptoms deduplicated |
| `unknown` duration not excluded | `inference.test.ts` | HIV/AIDS fires with unknown duration |

---

## 11. Environment Variables for Testing

All test environment variables are set in `src/tests/setup/jest.setup.ts` and take effect before any test file is loaded. You do not need a `.env` file to run the tests.

| Variable | Test value | Purpose |
|---|---|---|
| `NODE_ENV` | `test` | Disables production guards |
| `DATABASE_URL` | `postgresql://test:test@localhost:5432/medicheck_test` | Satisfies dotenv.config(); Pool is mocked so no real connection is made |
| `PORT` | `4001` | Avoids conflict with a running dev server |
| `CORS_ORIGIN` | `*` | No CORS restrictions in tests |
| `SWIPL_EXECUTABLE` | *(set automatically by expert-system test)* | Full path to swipl.exe when not on PATH |

### `SWIPL_EXECUTABLE` — Windows PATH workaround

The expert-system test file probes for `swipl` at startup:

1. Tries `swipl --version` — succeeds if swipl is on `PATH`
2. Falls back to `C:\Program Files\swipl\bin\swipl.exe` on Windows
3. If found at a non-PATH location, sets `process.env.SWIPL_EXECUTABLE` to the full path

`prologBridge.ts` reads this variable at **call time** (inside `runPrologInference()`), so the env var set in step 3 is always picked up regardless of module load order.

You can also set this variable manually in `.env` for the dev server:

```env
SWIPL_EXECUTABLE=C:\Program Files\swipl\bin\swipl.exe
```

---

## 12. Continuous Integration

### Recommended CI Pipeline (GitHub Actions example)

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  unit-and-integration:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Run unit tests
        run: pnpm test:unit

      - name: Run integration tests
        run: pnpm test:integration

      - name: Upload coverage
        run: pnpm test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: coverage/lcov.info

  expert-system:
    name: Expert-System Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Install SWI-Prolog
        run: sudo apt-get install -y swi-prolog

      - name: Install dependencies
        run: pnpm install

      - name: Run expert-system tests
        run: pnpm test:expert
```

### CI Best Practices Applied

- **Unit and integration tests** run on every push without any external tooling. They are fast (< 10 s) and require only Node.js.
- **Expert-system tests** run in a separate job so a missing swipl installation does not block the main test job.
- **Coverage** is generated and uploaded to a coverage service (e.g. Codecov) on every push to `main`.
- **`pnpm-lock.yaml` is committed** to the repository. The CI uses `pnpm install` (not `pnpm install --frozen-lockfile`) to avoid lockfile mismatches, but the lockfile ensures deterministic installs.

---

## 13. Writing New Tests

### Adding a New Unit Test

1. Place the file under `src/tests/unit/`.
2. Mock all external I/O at the top of the file using `jest.mock()` (before any imports).
3. Use `makePrologResult()`, `makeDbDiagnosisRow()`, etc. from `mockFactory.ts` instead of raw object literals.
4. Name each test with a full sentence: *what the function does given a specific input.*

```typescript
// Good test name
it('returns count 0 and empty diagnoses array for an unknown session', ...)

// Too vague
it('handles empty results', ...)
```

### Adding a New Integration Test

1. Place the file under `src/tests/integration/`.
2. Mock the service layer: `jest.mock('../../services/diagnosisService')`.
3. Create a fresh Express app in the test file — do not import `server.ts`.
4. Use `supertest` for all HTTP assertions.

### Adding a New Expert-System Test

1. Open `src/tests/expert-system/inference.test.ts`.
2. Use `itSwipl(...)` instead of `it(...)` so the test auto-skips when swipl is unavailable.
3. Use `assertDiagnosis(result, disease, confidence)` or `assertFallback(result)` for structured assertions.
4. Add a row to the [Rule Coverage Matrix](#10-expert-system-rule-coverage-matrix) above.

```typescript
itSwipl('new_rule fires when symptom_x is present → HIGH', async () => {
  const result = await runPrologInference(['symptom_x', 'symptom_y'], 'unknown');
  assertDiagnosis(result, 'disease_name', 'high');
  expect(result.rules_fired).toContain('new_rule');
});
```

### Adding a New Knowledge-Base Rule

When a new Prolog rule is added to `knowledge_base.pl` or `inference_engine.pl`:

1. **Add a positive test** — symptoms that should trigger the new rule.
2. **Add an exclusion test** (if applicable) — inputs that should NOT trigger it.
3. **Update the Rule Coverage Matrix** in this document.
4. Run `pnpm test:expert` to confirm the new rule produces the expected output.

---

## 14. Troubleshooting

### Expert-system tests are skipped

```
34 skipped, 34 total
```

SWI-Prolog is not installed or not on PATH.

- **Install SWI-Prolog:** [swi-prolog.org/Download.html](https://www.swi-prolog.org/Download.html)
- **Windows:** ensure `C:\Program Files\swipl\bin\swipl.exe` exists (default install path)
- **Verify:** `swipl --version` in a new terminal after installation

---

### `jest: command not found` / `'jest' is not recognized`

The test dependencies have not been installed, or the install was incomplete.

```bash
pnpm install --force
```

---

### Expert-system tests fail with `Prolog process failed` or `No JSON output`

SWI-Prolog is installed but `bridge.pl` cannot load `knowledge_base.pl` or `inference_engine.pl`.

- Ensure all three `.pl` files exist in the `prolog/` directory.
- Run the bridge manually to see the full Prolog error:

```bash
# Windows (PowerShell)
& "C:\Program Files\swipl\bin\swipl.exe" -g main -t halt prolog/bridge.pl -- --symptoms "fever,chills" --duration "unknown"

# macOS / Linux
swipl -g main -t halt prolog/bridge.pl -- --symptoms "fever,chills" --duration "unknown"
```

---

### Tests pass locally but fail in CI

1. Check that `pnpm-lock.yaml` is committed and up to date.
2. Ensure the CI job installs SWI-Prolog before running `pnpm test:expert`.
3. Check the CI Node.js version matches the local version (`node --version`).
4. If coverage thresholds fail in CI, run `pnpm test:coverage` locally and inspect `coverage/index.html`.

---

### `Database connection refused` in unit or integration tests

Unit and integration tests mock the database — they should never attempt a real connection. If you see this error it means a test is importing a module that calls `dotenv.config()` and then uses `pool.query` without going through the mock.

- Confirm `jest.mock('../../config/db', ...)` appears at the top of the test file **before** any imports.
- Confirm `src/tests/setup/jest.setup.ts` is listed in `setupFilesAfterEnv` in `jest.config.ts`.

---

### `Cannot find module` TypeScript error in tests

Re-check the relative path from the test file's location:

| Test file location | To reach `src/services/` | To reach `src/config/` |
|---|---|---|
| `src/tests/unit/` | `../../services/` | `../../config/` |
| `src/tests/integration/` | `../../services/` | `../../config/` |
| `src/tests/expert-system/` | `../../services/` | `../../config/` |
| `src/tests/helpers/` | `../../services/` | `../../config/` |

---

*This document was written alongside the test suite and should be kept in sync whenever new tests, new rules, or new configuration options are added.*
// =============================================================================
// MediCheck — Jest Global Test Setup
// Runs after the Jest test framework is installed, before every test file.
// =============================================================================

// ---------------------------------------------------------------------------
// Environment variables
// These must be set before any module that calls dotenv.config() is imported.
// ---------------------------------------------------------------------------
process.env.NODE_ENV     = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/medicheck_test';
process.env.PORT         = '4001';
process.env.CORS_ORIGIN  = '*';

// ---------------------------------------------------------------------------
// Console silencing
// Keeps test output clean. Remove / comment these out when debugging.
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Cleanup after every test
//  - restoreAllMocks  : reverts jest.spyOn() calls to their real implementations
//  - resetAllMocks    : clears call history and resets mockReturnValue etc.
//  - useRealTimers    : ensures fake timers never bleed across test boundaries
// ---------------------------------------------------------------------------
afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
  jest.useRealTimers();
});

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/tests'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup/jest.setup.ts'],

  // ---------------------------------------------------------------------------
  // Coverage
  // ---------------------------------------------------------------------------
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/tests/**',
    '!src/scripts/**',
    '!src/server.ts',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 85,
      lines:     85,
      statements: 85,
    },
  },

  // ---------------------------------------------------------------------------
  // Misc
  // ---------------------------------------------------------------------------
  testTimeout: 30_000,  // expert-system tests spawn a real swipl process
  verbose: true,
};

export default config;

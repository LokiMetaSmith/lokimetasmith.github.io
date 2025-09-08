/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  transform: {},
  moduleNameMapper: {
    '^@mattkrick/sanitize-svg$': '<rootDir>/tests/fileMock.js',
    '^jsdom$': '<rootDir>/tests/jsdomMock.js',
    '^telegraf$': '<rootDir>/tests/telegrafMock.js'
  },
};

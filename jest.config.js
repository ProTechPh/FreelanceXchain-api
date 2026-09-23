/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^supertest$': '<rootDir>/src/__tests__/helpers/stable-supertest.ts',
    '^file-type$': '<rootDir>/src/__mocks__/file-type.js',
    '^swagger-ui-express$': '<rootDir>/src/__mocks__/swagger-ui-express.cjs',
    '^@opencoredev/email-sdk/cloudflare$': '<rootDir>/src/__mocks__/email-sdk-cloudflare.cjs',
    '^@opencoredev/email-sdk$': '<rootDir>/src/__mocks__/email-sdk.cjs',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
        diagnostics: {
          ignoreCodes: [151002, 2304, 2305, 2307, 1343, 1378, 2441],
        },
      },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.test.ts'],
  // freelancexchain-email-worker is a separate Cloudflare Worker package with
  // its own `node --test` runner (see its package.json) — keep it out of the
  // API suite.
  testPathIgnorePatterns: ['node_modules', '\\.kilo', 'freelancexchain-email-worker'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/types/**',
    '!src/models/**',
    '!src/constants/**',
    '!src/__tests__/**',
    '!src/config/index.ts',
    '!src/config/database.ts',
    '!src/config/appwrite.ts',
    '!src/config/redis.ts',
    // Thin memoized SDK client, same rationale as redis/appwrite/web3-client:
    // no business logic, and constructing a real Stripe client in tests proves
    // nothing. The logic that uses it is covered in the services below.
    '!src/config/stripe.ts',
    '!src/services/contract-abis.ts',
    '!src/services/web3-client.ts',
    '!src/services/escrow-blockchain.ts',
    '!src/services/reputation-blockchain.ts',
    '!src/services/blockchain-client.ts',
    '!src/services/auth-service-appwrite.ts',
    '!src/services/payment-service.ts',
    '!src/services/reputation-service.ts',
    '!src/services/project-service.ts',
    '!src/services/notification-delivery-service.ts',
    '!src/services/**/*-types.ts',
    '!src/services/blockchain/adapter.ts',
    '!src/services/blockchain/index.ts',
    '!src/routes/didit-kyc-routes.ts',
    '!src/routes/dispute-routes.ts',
    '!src/routes/milestone-routes.ts',
    '!src/routes/portfolio-routes.ts',
    '!src/routes/proposal-routes.ts',
    '!src/routes/webhook-routes.ts',
    '!src/utils/entity-mapper.ts',
    '!src/middleware/file-upload-middleware.ts',
  ],
  coverageDirectory: 'coverage',
  coverageProvider: 'babel',
  coverageThreshold: {
    global: {
      lines: 90,
      branches: 80,
      functions: 93.5,
      statements: 90,
    },
  },
  verbose: true,
  testTimeout: 30000,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(file-type|strtok3|token-types|peek-readable|uint8array-extras)/)'
  ],
};

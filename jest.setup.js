// Jest setup file
// Load environment variables for tests
import dotenv from 'dotenv';
import { jest } from '@jest/globals';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Ensure test environment is set
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Add BigInt serialization support to prevent Jest worker errors
BigInt.prototype.toJSON = function() {
  return this.toString();
};

// Mock PostgreSQL Pool
const mockPool = {
  query: jest.fn(),
  connect: jest.fn(() => ({
    query: jest.fn(),
    release: jest.fn(),
  })),
  on: jest.fn(),
  end: jest.fn(),
};

// Global test setup
global.mockPool = mockPool;

// Mock the Database module globally
jest.unstable_mockModule('./src/config/database.js', () => ({
  pool: mockPool,
  initializeDatabase: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}), { virtual: true });

// Mock fetch globally to prevent actual network calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: false,
    status: 500,
    statusText: 'Mocked fetch - should not be called in tests',
    json: () => Promise.resolve({ error: 'Mocked fetch error' }),
    text: () => Promise.resolve('Mocked fetch error'),
  })
);

// Suppress console warnings in tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = (...args) => {
  // Suppress specific warnings that are expected in test environment
  const message = args[0];
  if (typeof message === 'string' && (
    message.includes('fetch failed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('network')
  )) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

console.error = (...args) => {
  // Suppress specific errors that are expected in test environment
  const message = args[0];
  if (typeof message === 'string' && (
    message.includes('fetch failed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('network')
  )) {
    return;
  }
  originalConsoleError.apply(console, args);
};

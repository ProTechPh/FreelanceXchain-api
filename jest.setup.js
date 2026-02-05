// Jest setup file
// Load environment variables for tests
import dotenv from 'dotenv';
import { jest } from '@jest/globals';

<<<<<<< Updated upstream
dotenv.config({ path: '.env' });
=======
// Load test environment variables
dotenv.config({ path: '.env.test' });
>>>>>>> Stashed changes

// Ensure test environment is set
process.env.NODE_ENV = 'test';
<<<<<<< Updated upstream
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Add BigInt serialization support to prevent Jest worker errors
BigInt.prototype.toJSON = function() {
  return this.toString();
=======

// Enhanced Mock Supabase client with comprehensive query builder
const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    containedBy: jest.fn().mockReturnThis(),
    rangeGt: jest.fn().mockReturnThis(),
    rangeGte: jest.fn().mockReturnThis(),
    rangeLt: jest.fn().mockReturnThis(),
    rangeLte: jest.fn().mockReturnThis(),
    rangeAdjacent: jest.fn().mockReturnThis(),
    overlaps: jest.fn().mockReturnThis(),
    textSearch: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    abortSignal: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    csv: jest.fn().mockReturnThis(),
    geojson: jest.fn().mockReturnThis(),
    explain: jest.fn().mockReturnThis(),
    rollback: jest.fn().mockReturnThis(),
    returns: jest.fn().mockReturnThis(),
    then: jest.fn().mockResolvedValue({ data: [], error: null }),
    catch: jest.fn(),
  })),
  auth: {
    signUp: jest.fn().mockResolvedValue({ 
      data: { user: { id: '1', email: 'test@example.com' }, session: null }, 
      error: null 
    }),
    signInWithPassword: jest.fn().mockResolvedValue({ 
      data: { user: { id: '1', email: 'test@example.com' }, session: null }, 
      error: null 
    }),
    getUser: jest.fn().mockResolvedValue({ 
      data: { user: { id: '1', email: 'test@example.com' } }, 
      error: null 
    }),
    getSession: jest.fn().mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
    signInWithOAuth: jest.fn().mockResolvedValue({ 
      data: { url: 'https://mock-oauth-url.com' }, 
      error: null 
    }),
    refreshSession: jest.fn().mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
    setSession: jest.fn().mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
    updateUser: jest.fn().mockResolvedValue({ 
      data: { user: null }, 
      error: null 
    }),
    resetPasswordForEmail: jest.fn().mockResolvedValue({ 
      data: null, 
      error: null 
    }),
    resend: jest.fn().mockResolvedValue({ 
      data: null, 
      error: null 
    }),
    exchangeCodeForSession: jest.fn().mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
  },
};

// Global test setup
global.mockSupabaseClient = mockSupabaseClient;

// Mock the Supabase module globally
jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

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
>>>>>>> Stashed changes
};

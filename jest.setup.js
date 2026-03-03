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

// Enhanced Mock Supabase client with comprehensive query builder
const blockchainTransactionStore = new Map();

const createGenericQueryBuilder = () => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
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
  then: (onFulfilled, onRejected) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
  catch: (onRejected) => Promise.resolve({ data: [], error: null }).catch(onRejected),
});

const createBlockchainTransactionBuilder = () => {
  let eqFilter = null;
  let updatePayload = null;
  let isDelete = false;

  const getRowById = () => {
    if (!eqFilter || eqFilter.column !== 'id') {
      return null;
    }

    const row = blockchainTransactionStore.get(String(eqFilter.value));
    return row ? { ...row } : null;
  };

  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn(async (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];

      for (const row of rows) {
        if (row && typeof row === 'object' && typeof row.id === 'string') {
          blockchainTransactionStore.set(row.id, { ...row });
        }
      }

      return { data: rows, error: null };
    }),
    update: jest.fn((values) => {
      updatePayload = values && typeof values === 'object' ? { ...values } : null;
      return builder;
    }),
    delete: jest.fn(() => {
      isDelete = true;
      return builder;
    }),
    eq: jest.fn((column, value) => {
      eqFilter = { column, value };
      return builder;
    }),
    neq: jest.fn(async (column, value) => {
      if (isDelete && column === 'id') {
        const excludedId = String(value);

        for (const id of Array.from(blockchainTransactionStore.keys())) {
          if (id !== excludedId) {
            blockchainTransactionStore.delete(id);
          }
        }
      }

      return { data: [], error: null };
    }),
    single: jest.fn(async () => {
      const row = getRowById();
      if (!row) {
        return { data: null, error: { message: 'Row not found' } };
      }

      if (updatePayload) {
        const updatedRow = { ...row, ...updatePayload };
        blockchainTransactionStore.set(row.id, updatedRow);
        return { data: updatedRow, error: null };
      }

      return { data: row, error: null };
    }),
    maybeSingle: jest.fn(async () => {
      const row = getRowById();
      return { data: row, error: null };
    }),
    then: (onFulfilled, onRejected) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve({ data: [], error: null }).catch(onRejected),
  };

  return builder;
};

const blockchainKycStore = new Map();

const createBlockchainKycBuilder = () => {
  const eqFilters = [];
  const gteFilters = [];
  let selectedColumns = '*';
  let updatePayload = null;
  let isDelete = false;

  const matchesFilters = (row) => {
    for (const filter of eqFilters) {
      if (row[filter.column] !== filter.value) {
        return false;
      }
    }

    for (const filter of gteFilters) {
      const rowValue = row[filter.column];
      if (typeof rowValue !== 'number' || rowValue < filter.value) {
        return false;
      }
    }

    return true;
  };

  const projectRow = (row) => {
    if (!selectedColumns || selectedColumns === '*') {
      return { ...row };
    }

    const projected = {};
    for (const column of selectedColumns.split(',').map((value) => value.trim()).filter(Boolean)) {
      projected[column] = row[column];
    }

    return projected;
  };

  const queryRows = () => {
    return Array.from(blockchainKycStore.values())
      .filter(matchesFilters)
      .map(projectRow);
  };

  const applyUpdate = () => {
    if (!updatePayload) {
      return [];
    }

    const updatedRows = [];
    for (const [walletAddress, row] of blockchainKycStore.entries()) {
      if (!matchesFilters(row)) {
        continue;
      }

      const updatedRow = { ...row, ...updatePayload };
      blockchainKycStore.set(walletAddress, updatedRow);
      updatedRows.push(projectRow(updatedRow));
    }

    updatePayload = null;
    return updatedRows;
  };

  const builder = {
    select: jest.fn((columns = '*') => {
      selectedColumns = columns;
      return builder;
    }),
    upsert: jest.fn(async (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];

      for (const row of rows) {
        if (!row || typeof row !== 'object' || typeof row.wallet_address !== 'string') {
          continue;
        }

        const existing = blockchainKycStore.get(row.wallet_address);
        blockchainKycStore.set(row.wallet_address, {
          ...(existing || {}),
          ...row,
        });
      }

      return { data: rows, error: null };
    }),
    update: jest.fn((values) => {
      updatePayload = values && typeof values === 'object' ? { ...values } : null;
      return builder;
    }),
    delete: jest.fn(() => {
      isDelete = true;
      return builder;
    }),
    eq: jest.fn((column, value) => {
      eqFilters.push({ column, value });
      return builder;
    }),
    gte: jest.fn((column, value) => {
      gteFilters.push({ column, value });
      return builder;
    }),
    neq: jest.fn(async (column, value) => {
      if (isDelete) {
        for (const [walletAddress, row] of blockchainKycStore.entries()) {
          if (row[column] !== value) {
            blockchainKycStore.delete(walletAddress);
          }
        }
      }

      return { data: [], error: null };
    }),
    single: jest.fn(async () => {
      const rows = updatePayload ? applyUpdate() : queryRows();
      const row = rows[0];

      if (!row) {
        return { data: null, error: { message: 'Row not found' } };
      }

      return { data: row, error: null };
    }),
    then: (onFulfilled, onRejected) => {
      const data = updatePayload ? applyUpdate() : queryRows();
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
    catch: (onRejected) => Promise.resolve({ data: [], error: null }).catch(onRejected),
  };

  return builder;
};

const mockSupabaseClient = {
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  from: jest.fn((table) => {
    if (table === 'blockchain_transactions') {
      return createBlockchainTransactionBuilder();
    }

    if (table === 'blockchain_kyc_verifications') {
      return createBlockchainKycBuilder();
    }

    return createGenericQueryBuilder();
  }),
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
};

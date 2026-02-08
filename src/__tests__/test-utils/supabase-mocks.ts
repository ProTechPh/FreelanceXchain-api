/**
 * Supabase Test Utilities
 * Provides mock implementations for Supabase services in tests
 */

import { jest } from '@jest/globals';

// Generate mock entity with proper ID and common fields
function generateMockEntity(): any {
  const baseId = `00000000-0000-1000-8000-${Date.now().toString().padStart(12, '0')}`;
  return {
    id: baseId,
    user_id: 'test-user-id',
    name: 'Test Entity',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    // Common profile fields
    bio: 'Test bio',
    hourly_rate: 50,
    availability: 'available',
    nationality: 'US',
    company_name: 'Test Company',
    description: 'Test description',
    industry: 'Technology',
    // Contract fields
    project_id: 'test-project-id',
    freelancer_id: 'test-freelancer-id',
    employer_id: 'test-employer-id',
    total_amount: 1000,
    status: 'active',
    // Project fields
    title: 'Test Project',
    budget: 1000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    // Skill fields
    years_of_experience: 3,
    // KYC fields
    verification_status: 'approved',
    document_type: 'passport',
  };
}

// Mock Supabase client responses
export const mockSupabaseResponses = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    user_metadata: { role: 'freelancer' },
  },
  session: {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
  },
  kycVerification: {
    id: 'test-kyc-id',
    user_id: 'test-user-id',
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

// Create mock Supabase client that returns successful responses by default
export function createMockSupabaseClient(): any {
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
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
    single: (jest.fn() as any).mockResolvedValue({ data: generateMockEntity(), error: null }),
    maybeSingle: (jest.fn() as any).mockResolvedValue({ data: generateMockEntity(), error: null }),
    csv: jest.fn().mockReturnThis(),
    geojson: jest.fn().mockReturnThis(),
    explain: jest.fn().mockReturnThis(),
    rollback: jest.fn().mockReturnThis(),
    returns: jest.fn().mockReturnThis(),
    then: (jest.fn() as any).mockResolvedValue({ data: [generateMockEntity()], error: null, count: 1 }),
    catch: jest.fn(),
  };

  return {
    from: jest.fn(() => mockQueryBuilder),
    auth: {
      signUp: jest.fn(() => Promise.resolve({ 
        data: { user: mockSupabaseResponses.user, session: mockSupabaseResponses.session }, 
        error: null 
      })),
      signInWithPassword: jest.fn(() => Promise.resolve({ 
        data: { user: mockSupabaseResponses.user, session: mockSupabaseResponses.session }, 
        error: null 
      })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      getUser: jest.fn(() => Promise.resolve({ 
        data: { user: mockSupabaseResponses.user }, 
        error: null 
      })),
      refreshSession: jest.fn(() => Promise.resolve({ 
        data: { session: mockSupabaseResponses.session }, 
        error: null 
      })),
      signInWithOAuth: jest.fn(() => Promise.resolve({ 
        data: { url: 'https://mock-oauth-url.com' }, 
        error: null 
      })),
      setSession: jest.fn(() => Promise.resolve({ 
        data: { session: mockSupabaseResponses.session }, 
        error: null 
      })),
      updateUser: jest.fn(() => Promise.resolve({ 
        data: { user: mockSupabaseResponses.user }, 
        error: null 
      })),
      resetPasswordForEmail: jest.fn(() => Promise.resolve({ 
        data: null, 
        error: null 
      })),
      resend: jest.fn(() => Promise.resolve({ 
        data: null, 
        error: null 
      })),
      exchangeCodeForSession: jest.fn(() => Promise.resolve({ 
        data: { session: mockSupabaseResponses.session }, 
        error: null 
      })),
    },
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(() => Promise.resolve({ data: null, error: null })),
        download: jest.fn(() => Promise.resolve({ data: null, error: null })),
        remove: jest.fn(() => Promise.resolve({ data: null, error: null })),
        list: jest.fn(() => Promise.resolve({ data: [], error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://mock-url.com' } })),
      })),
    },
  };
}

// Setup Supabase mocks for tests
export function setupSupabaseMocks(): any {
  const mockClient = createMockSupabaseClient();

  // Mock the Supabase config module
  jest.mock('../../config/supabase.js', () => ({
    getSupabaseClient: jest.fn(() => mockClient),
  }));

  return mockClient;
}

// Mock KYC repository functions
export function mockKycRepository() {
  jest.mock('../../repositories/didit-kyc-repository.js', () => ({
    getKycVerificationByUserId: jest.fn(() => Promise.resolve(null)),
    createKycVerification: jest.fn(() => Promise.resolve(mockSupabaseResponses.kycVerification)),
    updateKycVerification: jest.fn(() => Promise.resolve(mockSupabaseResponses.kycVerification)),
    getKycVerificationById: jest.fn(() => Promise.resolve(mockSupabaseResponses.kycVerification)),
  }));
}

// Mock data stores for different entities
export const mockDataStores = {
  users: new Map(),
  projects: new Map(),
  contracts: new Map(),
  proposals: new Map(),
  freelancerProfiles: new Map(),
  employerProfiles: new Map(),
  notifications: new Map(),
  disputes: new Map(),
  reviews: new Map(),
  messages: new Map(),
  payments: new Map(),
  skills: new Map(),
  skillCategories: new Map(),
  kycVerifications: new Map(),
};

// Helper to clear all mock data stores
export function clearAllMockStores() {
  Object.values(mockDataStores).forEach(store => store.clear());
}

// Reset all Supabase mocks
export function resetSupabaseMocks() {
  jest.clearAllMocks();
  clearAllMockStores();
}
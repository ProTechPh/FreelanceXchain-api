/**
 * Jest Setup File
 * Sets mock environment variables for testing BEFORE any modules are imported
 */

// Mock Supabase environment variables
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_KEY = 'test-anon-key-for-testing-purposes-only';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key-for-testing-purposes-only';

// Mock JWT configuration
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only-minimum-32-chars';
process.env.JWT_EXPIRY = '7d';

// Mock Blockchain configuration
process.env.BLOCKCHAIN_RPC_URL = 'http://localhost:8545';
process.env.BLOCKCHAIN_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
process.env.REPUTATION_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001';
process.env.ESCROW_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000002';
process.env.KYC_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000003';

// Mock AI configuration
process.env.GEMINI_API_KEY = 'test-gemini-api-key';

// Set test environment
process.env.NODE_ENV = 'test';

// CORS configuration
process.env.CORS_ORIGIN = 'http://localhost:3000';

console.log('[Jest Setup] Test environment variables initialized');

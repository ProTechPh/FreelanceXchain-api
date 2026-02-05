// Jest setup file
// Load environment variables for tests
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Set test environment defaults
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Add BigInt serialization support to prevent Jest worker errors
BigInt.prototype.toJSON = function() {
  return this.toString();
};

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { User, UserRole } from '../../models/user.js';
import { RegisterInput, LoginInput, AuthResult, AuthError } from '../auth-types.js';

// In-memory user store for testing
let userStore: Map<string, User> = new Map();

// Mock the user repository before importing auth-service
jest.unstable_mockModule('../../repositories/user-repository.js', () => ({
  userRepository: {
    emailExists: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email === email.toLowerCase()) return true;
      }
      return false;
    }),
    createUser: jest.fn(async (user: User) => {
      userStore.set(user.id, user);
      return user;
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email === email.toLowerCase()) return user;
      }
      return null;
    }),
    getUserById: jest.fn(async (id: string) => {
      return userStore.get(id) ?? null;
    }),
  },
  UserRepository: jest.fn(),
}));

// Import after mocking
const { register, login, isAuthError } = await import('../auth-service.js');


// Custom arbitraries for property-based testing
const validEmailArbitrary = () =>
  fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
    fc.constantFrom('test.com', 'example.org', 'mail.net')
  ).map(([local, domain]) => `${local}@${domain}`);

const validPasswordArbitrary = () =>
  fc.tuple(
    fc.stringMatching(/^[A-Z][a-z]{3,6}$/),
    fc.stringMatching(/^[0-9]{2,4}$/),
    fc.stringMatching(/^[a-z]{2,4}$/)
  ).map(([upper, nums, lower]) => `${upper}${nums}${lower}`);

const validRoleArbitrary = () =>
  fc.constantFrom<UserRole>('freelancer', 'employer');

const validRegistrationDataArbitrary = () =>
  fc.record({
    email: validEmailArbitrary(),
    password: validPasswordArbitrary(),
    role: validRoleArbitrary(),
  });

describe('Auth Service - Registration Properties', () => {
  beforeEach(() => {
    userStore.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 1: Registration creates unique accounts**
   * **Validates: Requirements 1.1, 1.3**
   * 
   * For any valid registration data with unique email, the system shall create
   * exactly one user account and return valid authentication credentials
   * containing the specified role.
   */
  it('Property 1: Registration creates unique accounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        async (registrationData: RegisterInput) => {
          // Clear store for each test case
          userStore.clear();

          const result = await register(registrationData);

          // Should not be an error
          expect(isAuthError(result)).toBe(false);

          if (!isAuthError(result)) {
            const authResult = result as AuthResult;

            // Verify user data matches input
            expect(authResult.user.email).toBe(registrationData.email.toLowerCase());
            expect(authResult.user.role).toBe(registrationData.role);

            // Verify tokens are present
            expect(authResult.accessToken).toBeDefined();
            expect(authResult.refreshToken).toBeDefined();

            // Verify access token contains correct claims
            const decoded = jwt.verify(authResult.accessToken, config.jwt.secret) as {
              userId: string;
              email: string;
              role: UserRole;
              type: string;
            };
            expect(decoded.email).toBe(registrationData.email.toLowerCase());
            expect(decoded.role).toBe(registrationData.role);
            expect(decoded.type).toBe('access');

            // Verify exactly one user was created
            expect(userStore.size).toBe(1);

            // Verify user exists in store with correct data
            const storedUser = userStore.get(authResult.user.id);
            expect(storedUser).toBeDefined();
            expect(storedUser?.email).toBe(registrationData.email.toLowerCase());
            expect(storedUser?.role).toBe(registrationData.role);

            // Verify password was hashed (not stored in plain text)
            expect(storedUser?.passwordHash).not.toBe(registrationData.password);
            const passwordValid = await bcrypt.compare(
              registrationData.password,
              storedUser?.passwordHash ?? ''
            );
            expect(passwordValid).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 2: Duplicate email rejection**
   * **Validates: Requirements 1.2**
   * 
   * For any email that is already registered, attempting to register again
   * with that email shall be rejected with a duplicate email error,
   * and no new account shall be created.
   */
  it('Property 2: Duplicate email rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        validPasswordArbitrary(),
        validRoleArbitrary(),
        async (firstRegistration: RegisterInput, secondPassword: string, secondRole: UserRole) => {
          // Clear store for each test case
          userStore.clear();

          // First registration should succeed
          const firstResult = await register(firstRegistration);
          expect(isAuthError(firstResult)).toBe(false);

          const userCountAfterFirst = userStore.size;
          expect(userCountAfterFirst).toBe(1);

          // Second registration with same email should fail
          const secondRegistration: RegisterInput = {
            email: firstRegistration.email,
            password: secondPassword,
            role: secondRole,
          };

          const secondResult = await register(secondRegistration);

          // Should be a duplicate email error
          expect(isAuthError(secondResult)).toBe(true);

          if (isAuthError(secondResult)) {
            const error = secondResult as AuthError;
            expect(error.code).toBe('DUPLICATE_EMAIL');
          }

          // No new user should be created
          expect(userStore.size).toBe(userCountAfterFirst);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: Case-insensitive email duplicate detection
   * Emails should be treated as case-insensitive for duplicate detection
   */
  it('Property 2 (extended): Case-insensitive duplicate email rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        async (registrationData: RegisterInput) => {
          // Clear store for each test case
          userStore.clear();

          // First registration with lowercase email
          const firstResult = await register(registrationData);
          expect(isAuthError(firstResult)).toBe(false);

          // Second registration with uppercase email should also fail
          const upperCaseRegistration: RegisterInput = {
            ...registrationData,
            email: registrationData.email.toUpperCase(),
          };

          const secondResult = await register(upperCaseRegistration);

          expect(isAuthError(secondResult)).toBe(true);
          if (isAuthError(secondResult)) {
            expect((secondResult as AuthError).code).toBe('DUPLICATE_EMAIL');
          }

          // Still only one user
          expect(userStore.size).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Auth Service - Authentication Properties', () => {
  beforeEach(() => {
    userStore.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 3: Invalid credentials rejection**
   * **Validates: Requirements 1.4**
   * 
   * For any login attempt with credentials that do not match a registered user,
   * the system shall reject authentication and return an invalid credentials error.
   */
  it('Property 3: Invalid credentials rejection - non-existent email', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary(),
        validPasswordArbitrary(),
        async (email: string, password: string) => {
          // Clear store - no users registered
          userStore.clear();

          const loginInput: LoginInput = { email, password };
          const result = await login(loginInput);

          // Should be an error
          expect(isAuthError(result)).toBe(true);

          if (isAuthError(result)) {
            const error = result as AuthError;
            expect(error.code).toBe('INVALID_CREDENTIALS');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 3: Invalid credentials rejection**
   * **Validates: Requirements 1.4**
   * 
   * For any registered user, login with wrong password shall be rejected.
   */
  it('Property 3: Invalid credentials rejection - wrong password', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        validPasswordArbitrary(),
        async (registrationData: RegisterInput, wrongPassword: string) => {
          // Clear store for each test case
          userStore.clear();

          // Register a user first
          const registerResult = await register(registrationData);
          expect(isAuthError(registerResult)).toBe(false);

          // Ensure wrong password is different from correct password
          if (wrongPassword === registrationData.password) {
            return; // Skip this test case
          }

          // Try to login with wrong password
          const loginInput: LoginInput = {
            email: registrationData.email,
            password: wrongPassword,
          };
          const loginResult = await login(loginInput);

          // Should be an error
          expect(isAuthError(loginResult)).toBe(true);

          if (isAuthError(loginResult)) {
            const error = loginResult as AuthError;
            expect(error.code).toBe('INVALID_CREDENTIALS');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: Successful login with correct credentials
   * For any registered user, login with correct credentials shall succeed.
   */
  it('Property 3 (complement): Successful login with correct credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        async (registrationData: RegisterInput) => {
          // Clear store for each test case
          userStore.clear();

          // Register a user first
          const registerResult = await register(registrationData);
          expect(isAuthError(registerResult)).toBe(false);

          // Login with correct credentials
          const loginInput: LoginInput = {
            email: registrationData.email,
            password: registrationData.password,
          };
          const loginResult = await login(loginInput);

          // Should succeed
          expect(isAuthError(loginResult)).toBe(false);

          if (!isAuthError(loginResult)) {
            const authResult = loginResult as AuthResult;
            expect(authResult.user.email).toBe(registrationData.email.toLowerCase());
            expect(authResult.user.role).toBe(registrationData.role);
            expect(authResult.accessToken).toBeDefined();
            expect(authResult.refreshToken).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

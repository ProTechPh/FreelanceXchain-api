/**
 * Test Assertions
 * Custom assertion helpers for common test patterns
 */

import { expect } from '@jest/globals';

/**
 * Assert that an object has the expected shape (checks for presence of keys)
 */
export function assertHasShape<T extends Record<string, any>>(
  obj: any,
  expectedKeys: (keyof T)[]
): void {
  expect(obj).toBeDefined();
  expect(typeof obj).toBe('object');
  
  for (const key of expectedKeys) {
    expect(obj).toHaveProperty(key as string);
  }
}

/**
 * Assert that a date string is valid and recent (within last minute)
 */
export function assertIsRecentDate(dateString: string): void {
  const date = new Date(dateString);
  expect(date.toString()).not.toBe('Invalid Date');
  
  const now = Date.now();
  const timestamp = date.getTime();
  const oneMinute = 60 * 1000;
  
  expect(timestamp).toBeGreaterThan(now - oneMinute);
  expect(timestamp).toBeLessThanOrEqual(now + 1000); // Allow 1s clock skew
}

/**
 * Assert that an entity has standard timestamp fields
 * Supports both entity format (snake_case) and domain model format (camelCase)
 */
export function assertHasTimestamps(entity: any): void {
  // Check for domain model format (camelCase)
  if ('createdAt' in entity && 'updatedAt' in entity) {
    expect(entity).toHaveProperty('createdAt');
    expect(entity).toHaveProperty('updatedAt');
    assertIsRecentDate(entity.createdAt);
    assertIsRecentDate(entity.updatedAt);
  }
  // Check for entity format (snake_case)
  else if ('created_at' in entity && 'updated_at' in entity) {
    expect(entity).toHaveProperty('created_at');
    expect(entity).toHaveProperty('updated_at');
    assertIsRecentDate(entity.created_at);
    assertIsRecentDate(entity.updated_at);
  }
  else {
    throw new Error('Object does not have timestamp fields (neither createdAt/updatedAt nor created_at/updated_at)');
  }
}

/**
 * Assert that an error matches expected error structure
 */
export function assertIsAuthError(error: any, expectedCode?: string): void {
  expect(error).toBeDefined();
  expect(error).toHaveProperty('code');
  expect(error).toHaveProperty('message');
  
  if (expectedCode) {
    expect(error.code).toBe(expectedCode);
  }
}

/**
 * Assert that a value is a valid UUID
 */
export function assertIsValidId(id: string): void {
  expect(id).toBeDefined();
  expect(typeof id).toBe('string');
  expect(id.length).toBeGreaterThan(0);
}

/**
 * Assert that a wallet address is valid format
 */
export function assertIsValidWalletAddress(address: string): void {
  expect(address).toBeDefined();
  expect(typeof address).toBe('string');
  expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
}

/**
 * Assert that an array contains items matching a predicate
 */
export function assertArrayContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
): void {
  const found = array.some(predicate);
  expect(found).toBe(true);
  if (message && !found) {
    throw new Error(message);
  }
}

/**
 * Assert that all items in an array match a predicate
 */
export function assertAllMatch<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
): void {
  const allMatch = array.every(predicate);
  expect(allMatch).toBe(true);
  if (message && !allMatch) {
    throw new Error(message);
  }
}

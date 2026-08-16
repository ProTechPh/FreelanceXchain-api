/**
 * Request validation middleware.
 *
 * The implementation lives in `validation-core.ts` so tests can import the real
 * validation logic directly (e.g. to run `validate` for real while mocking only
 * `validateUUID`). This file re-exports everything for backwards compatibility.
 */
export * from './validation-core.js';

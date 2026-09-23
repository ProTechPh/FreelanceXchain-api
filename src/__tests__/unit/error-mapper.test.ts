import { describe, it, expect } from '@jest/globals';
import { HttpStatus } from '../../constants/http-status.js';
import { mapErrorCodeToStatus, resolveErrorStatus } from '../../utils/error-mapper.js';

describe('error-mapper', () => {
  describe('mapErrorCodeToStatus', () => {
    it('maps known error codes in ERROR_STATUS_MAP', () => {
      expect(mapErrorCodeToStatus('NOT_FOUND')).toBe(HttpStatus.NOT_FOUND);
      expect(mapErrorCodeToStatus('UNAUTHORIZED')).toBe(HttpStatus.FORBIDDEN);
      expect(mapErrorCodeToStatus('VALIDATION_ERROR')).toBe(HttpStatus.BAD_REQUEST);
      expect(mapErrorCodeToStatus('DUPLICATE_EMAIL')).toBe(HttpStatus.CONFLICT);
      expect(mapErrorCodeToStatus('TOKEN_EXPIRED')).toBe(HttpStatus.UNAUTHORIZED);
      expect(mapErrorCodeToStatus('RATE_LIMITED')).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('returns default fallback (BAD_REQUEST) for unknown code', () => {
      expect(mapErrorCodeToStatus('UNKNOWN_CODE')).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns custom fallback when provided', () => {
      expect(mapErrorCodeToStatus('UNKNOWN_CODE', HttpStatus.INTERNAL_SERVER_ERROR)).toBe(
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    });
  });

  describe('resolveErrorStatus', () => {
    it('resolves UNAUTHORIZED and TOKEN_EXPIRED to UNAUTHORIZED', () => {
      expect(resolveErrorStatus('UNAUTHORIZED')).toBe(HttpStatus.UNAUTHORIZED);
      expect(resolveErrorStatus('TOKEN_EXPIRED')).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('resolves FORBIDDEN and INSUFFICIENT_PERMISSIONS to FORBIDDEN', () => {
      expect(resolveErrorStatus('FORBIDDEN')).toBe(HttpStatus.FORBIDDEN);
      expect(resolveErrorStatus('INSUFFICIENT_PERMISSIONS')).toBe(HttpStatus.FORBIDDEN);
    });

    it('resolves NOT_FOUND and containing patterns to NOT_FOUND', () => {
      expect(resolveErrorStatus('NOT_FOUND')).toBe(HttpStatus.NOT_FOUND);
      expect(resolveErrorStatus('USER_NOT_FOUND')).toBe(HttpStatus.NOT_FOUND);
      expect(resolveErrorStatus('PROJECT_NOT_FOUND_ERROR')).toBe(HttpStatus.NOT_FOUND);
    });

    it('resolves conflicts to CONFLICT', () => {
      expect(resolveErrorStatus('DUPLICATE_EMAIL')).toBe(HttpStatus.CONFLICT);
      expect(resolveErrorStatus('DUPLICATE_PROPOSAL')).toBe(HttpStatus.CONFLICT);
      expect(resolveErrorStatus('ALREADY_DISPUTED')).toBe(HttpStatus.CONFLICT);
      expect(resolveErrorStatus('PROJECT_LOCKED')).toBe(HttpStatus.CONFLICT);
      expect(resolveErrorStatus('CONFLICT')).toBe(HttpStatus.CONFLICT);
    });

    it('resolves rate limits to TOO_MANY_REQUESTS', () => {
      expect(resolveErrorStatus('RATE_LIMITED')).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(resolveErrorStatus('TOO_MANY_REQUESTS')).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('defaults to BAD_REQUEST for unhandled error codes', () => {
      expect(resolveErrorStatus('INVALID_INPUT')).toBe(HttpStatus.BAD_REQUEST);
      expect(resolveErrorStatus('SOME_RANDOM_ERROR')).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});

import { describe, it, expect } from '@jest/globals';
import { getRequestId } from '../../utils/route-helpers.js';

const mockReq = (headers: Record<string, string | undefined> = {}) =>
  ({ headers } as any);

describe('route-helpers', () => {
  describe('getRequestId', () => {
    it('returns x-request-id header value when present', () => {
      const req = mockReq({ 'x-request-id': 'req-abc-123' });
      expect(getRequestId(req)).toBe('req-abc-123');
    });

    it('returns "unknown" when header is missing', () => {
      const req = mockReq({});
      expect(getRequestId(req)).toBe('unknown');
    });

    it('returns "unknown" when header is undefined', () => {
      const req = mockReq({ 'x-request-id': undefined });
      expect(getRequestId(req)).toBe('unknown');
    });
  });
});

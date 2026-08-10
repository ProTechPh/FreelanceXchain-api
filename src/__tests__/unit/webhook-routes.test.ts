import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import { verifyBlockchainSignature } from '../../routes/webhook-routes.js';

const SECRET = 'test-blockchain-secret';
const ENV_KEY = 'BLOCKCHAIN_WEBHOOK_SECRET';

function sign(payload: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const originalSecret = process.env[ENV_KEY];

beforeEach(() => {
  process.env[ENV_KEY] = SECRET;
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalSecret === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalSecret;
  }
});

describe('verifyBlockchainSignature', () => {
  it('returns true for a valid signature', () => {
    const payload = JSON.stringify({ event: 'payment.released', data: { id: '1' } });

    expect(verifyBlockchainSignature(payload, sign(payload))).toBe(true);
  });

  it('returns false when the signature content differs (same length)', () => {
    const payload = JSON.stringify({ event: 'payment.released', data: { id: '1' } });
    const valid = sign(payload);
    const tampered = valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0');

    expect(tampered).toHaveLength(valid.length);
    expect(tampered).not.toBe(valid);
    expect(verifyBlockchainSignature(payload, tampered)).toBe(false);
  });

  it('returns false when the signature length differs', () => {
    const payload = 'payload';

    expect(verifyBlockchainSignature(payload, 'short-signature')).toBe(false);
    expect(verifyBlockchainSignature(payload, sign(payload) + 'extra')).toBe(false);
  });

  it('returns false when BLOCKCHAIN_WEBHOOK_SECRET is not configured', () => {
    delete process.env[ENV_KEY];
    const payload = 'payload';

    expect(verifyBlockchainSignature(payload, sign(payload))).toBe(false);
  });

  it('returns false when timingSafeEqual throws (defensive catch)', () => {
    const payload = 'payload';

    const timingSafeEqualSpy = jest.spyOn(crypto, 'timingSafeEqual').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(verifyBlockchainSignature(payload, sign(payload))).toBe(false);
    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
  });
});

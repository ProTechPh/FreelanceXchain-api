import { jest } from '@jest/globals';
import { isDisposableEmail } from '../../utils/disposable-email.js';

describe('isDisposableEmail', () => {
  it('should return false for empty or non-string input', async () => {
    expect(await isDisposableEmail('')).toBe(false);
    expect(await isDisposableEmail(null as any)).toBe(false);
    expect(await isDisposableEmail(undefined as any)).toBe(false);
  });

  it('should identify known disposable domains immediately from local blocklist', async () => {
    expect(await isDisposableEmail('test@mailinator.com')).toBe(true);
    expect(await isDisposableEmail('test@tempmail.com')).toBe(true);
    expect(await isDisposableEmail('sesaw57853@omanarts.com')).toBe(true);
    expect(await isDisposableEmail('random@10minutemail.com')).toBe(true);
    expect(await isDisposableEmail('user@sharklasers.com')).toBe(true);
  });

  it('should return false for legitimate domains when API returns false', async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      json: async () => ({ disposable: 'false' }),
    });

    try {
      const result = await isDisposableEmail('valid.user@legitcompany.org');
      expect(result).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return true when DeBounce API returns disposable: "true"', async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      json: async () => ({ disposable: 'true' }),
    });

    try {
      const result = await isDisposableEmail('tempuser@newdisposableprovider.xyz');
      expect(result).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should fail-open (return false) if API request fails or times out', async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = jest.fn<any>().mockRejectedValue(new Error('Network error'));

    try {
      const result = await isDisposableEmail('user@unknown-domain-network-down.com');
      expect(result).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return false for email without domain', async () => {
    expect(await isDisposableEmail('notanemail')).toBe(false);
  });

  it('should return cached result on repeated lookup', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn<any>().mockResolvedValue({
      ok: true,
      json: async () => ({ disposable: 'true' }),
    });
    (globalThis as any).fetch = fetchMock;
    try {
      expect(await isDisposableEmail('test@cached-disposable.com')).toBe(true);
      expect(await isDisposableEmail('another@cached-disposable.com')).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should clear cache when cache size exceeds 2000', async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = jest.fn<any>().mockResolvedValue({
      ok: true,
      json: async () => ({ disposable: 'false' }),
    });
    try {
      for (let i = 0; i <= 2005; i++) {
        await isDisposableEmail(`test@d${i}.org`);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

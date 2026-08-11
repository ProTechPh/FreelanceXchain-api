import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { WebhookDeduper } from '../../utils/webhook-dedup.js';

describe('WebhookDeduper', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks a key as seen and reports later duplicates', () => {
    const deduper = new WebhookDeduper();
    expect(deduper.has('event:0xabc')).toBe(false);
    deduper.markProcessed('event:0xabc');
    expect(deduper.has('event:0xabc')).toBe(true);
  });

  it('checkAndMark returns true only for duplicates', () => {
    const deduper = new WebhookDeduper();
    expect(deduper.checkAndMark('k1')).toBe(false);
    expect(deduper.checkAndMark('k1')).toBe(true);
    expect(deduper.checkAndMark('k2')).toBe(false);
  });

  it('forgets keys after the TTL expires', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    const deduper = new WebhookDeduper({ ttlMs: 1000 });
    deduper.markProcessed('k1');

    jest.setSystemTime(now + 2000);
    expect(deduper.has('k1')).toBe(false);
  });

  it('prunes old entries when over maxKeys', () => {
    const deduper = new WebhookDeduper({ maxKeys: 2 });
    deduper.markProcessed('k1');
    deduper.markProcessed('k2');
    deduper.markProcessed('k3'); // over max => prune expired first

    expect(deduper.has('k3')).toBe(true);
  });

  it('clear removes all keys', () => {
    const deduper = new WebhookDeduper();
    deduper.markProcessed('k1');
    deduper.clear();
    expect(deduper.has('k1')).toBe(false);
  });
});

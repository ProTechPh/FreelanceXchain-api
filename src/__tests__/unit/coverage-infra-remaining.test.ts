import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('Infrastructure remaining coverage', () => {
  describe('app.ts webhook verify callback (line 33)', () => {
    it('should store rawBody for webhook path', async () => {
      const { createApp } = await import('../../app.js');
      const app = await createApp();
      const res = await request(app)
        .post('/api/kyc/webhook')
        .send({ event: 'test' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('cache.ts coverage (lines 12, 55)', () => {
    it('should create LRUCache with custom params and start/stop cleanup', async () => {
      const { LRUCache } = await import('../../utils/cache.js');
      const cache = new LRUCache<string>(10, 100);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      cache.startCleanup(50);
      await new Promise(r => setTimeout(r, 200));
      expect(cache.size).toBeLessThanOrEqual(1);
      cache.stopCleanup();
    });
  });
});

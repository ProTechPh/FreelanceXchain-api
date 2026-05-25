import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LRUCache, skillCache } from '../../utils/cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3, 60_000);
  });

  afterEach(() => {
    cache.stopCleanup();
  });

  describe('get', () => {
    it('should return undefined for a key that does not exist', () => {
      expect(cache.get('missing')).toBeUndefined();
    });

    it('should return the stored value for a cached key', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for an expired entry', () => {
      jest.useFakeTimers();
      cache.set('key1', 'value1', 100);
      jest.advanceTimersByTime(200);
      expect(cache.get('key1')).toBeUndefined();
      jest.useRealTimers();
    });

    it('should promote accessed key to most-recently-used position', () => {
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.set('c', 'C');
      cache.get('a');
      cache.set('d', 'D');
      expect(cache.get('a')).toBe('A');
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should store and retrieve a value', () => {
      cache.set('x', 'hello');
      expect(cache.get('x')).toBe('hello');
    });

    it('should update an existing key', () => {
      cache.set('k', 'v1');
      cache.set('k', 'v2');
      expect(cache.get('k')).toBe('v2');
      expect(cache.size).toBe(1);
    });

    it('should respect custom TTL', () => {
      jest.useFakeTimers();
      cache.set('short', 'val', 50);
      jest.advanceTimersByTime(100);
      expect(cache.get('short')).toBeUndefined();
      jest.useRealTimers();
    });

    it('should evict the least-recently-used entry when at capacity', () => {
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.set('c', 'C');
      cache.set('d', 'D');
      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should remove a key and return true', () => {
      cache.set('k', 'v');
      expect(cache.delete('k')).toBe(true);
      expect(cache.get('k')).toBeUndefined();
    });

    it('should return false when key does not exist', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('a', 'A');
      cache.set('b', 'B');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should reflect the number of stored entries', () => {
      expect(cache.size).toBe(0);
      cache.set('a', 'A');
      expect(cache.size).toBe(1);
      cache.set('b', 'B');
      expect(cache.size).toBe(2);
    });
  });

  describe('startCleanup / stopCleanup', () => {
    it('should start a cleanup timer that evicts expired entries', () => {
      jest.useFakeTimers();
      const smallCache = new LRUCache<string>(10, 50);
      smallCache.set('k', 'v', 50);
      smallCache.startCleanup(100);
      jest.advanceTimersByTime(200);
      expect(smallCache.get('k')).toBeUndefined();
      smallCache.stopCleanup();
      jest.useRealTimers();
    });

    it('should stop the cleanup timer', () => {
      jest.useFakeTimers();
      const c = new LRUCache<string>(10, 100);
      c.set('key', 'val', 50);
      c.startCleanup(100);
      c.stopCleanup();
      jest.advanceTimersByTime(500);
      jest.useRealTimers();
      c.stopCleanup();
    });

    it('should restart cleanup if called twice', () => {
      jest.useFakeTimers();
      cache.startCleanup(100);
      cache.startCleanup(200);
      cache.stopCleanup();
      jest.useRealTimers();
    });

    it('stopCleanup is safe to call when no timer is running', () => {
      expect(() => cache.stopCleanup()).not.toThrow();
    });
  });
});

describe('skillCache singleton', () => {
  it('should be an instance of LRUCache', () => {
    expect(skillCache).toBeInstanceOf(LRUCache);
  });

  it('should be able to store and retrieve values', () => {
    skillCache.set('test-skill', ['React', 'Vue']);
    expect(skillCache.get('test-skill')).toEqual(['React', 'Vue']);
    skillCache.delete('test-skill');
  });
});

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import {
  classifyRouteClass,
  recordSliSample,
  getSliSummary,
  getAllSliSummaries,
  resetSliMetrics,
  type SliRouteClass,
} from '../../services/sli-metrics-service.js';

describe('SLI Metrics Service', () => {
  beforeEach(() => {
    resetSliMetrics();
  });

  afterEach(() => {
    resetSliMetrics();
  });

  describe('classifyRouteClass', () => {
    it('classifies dashboard paths', () => {
      expect(classifyRouteClass('/api/dashboard')).toBe('dashboard');
      expect(classifyRouteClass('/api/dashboard?x=1')).toBe('dashboard');
    });

    it('classifies contracts paths', () => {
      expect(classifyRouteClass('/api/contracts')).toBe('contracts');
      expect(classifyRouteClass('/api/contracts/abc/disputes')).toBe('contracts');
    });

    it('classifies everything else as global', () => {
      expect(classifyRouteClass('/api/auth/login')).toBe('global');
      expect(classifyRouteClass('/api/projects')).toBe('global');
      expect(classifyRouteClass('/')).toBe('global');
    });

    it('does not over-match sibling routes sharing a prefix', () => {
      expect(classifyRouteClass('/api/dashboard-settings')).toBe('global');
      expect(classifyRouteClass('/api/contracts-admin')).toBe('global');
      expect(classifyRouteClass('/api/contracts')).toBe('contracts');
      expect(classifyRouteClass('/api/contracts/1/milestones')).toBe('contracts');
    });
  });

  describe('recordSliSample + getSliSummary', () => {
    it('computes availability and percentiles from recorded samples', () => {
      // 90 successful requests at ~100ms, 10 server errors
      for (let i = 0; i < 90; i++) {
        recordSliSample('dashboard', 200, 100);
      }
      for (let i = 0; i < 10; i++) {
        recordSliSample('dashboard', 500, 500);
      }

      const summary = getSliSummary('dashboard');
      expect(summary.totalRequests).toBe(100);
      expect(summary.serverErrorRequests).toBe(10);
      expect(summary.availability).toBe(0.9);
      // 90% availability vs 99.5% target => budget consumed
      expect(summary.errorBudgetBurn).toBeGreaterThan(1);
      expect(summary.latency.p50).toBe(100);
      // 90 samples at 100ms + 10 at 500ms: p95/p99 fall in the top-10 spike.
      expect(summary.latency.p95).toBe(500);
      expect(summary.latency.p99).toBe(500);
      expect(summary.latencySamples).toBe(100);
      expect(summary.windowDays).toBe(30);
      expect(summary.routeClass).toBe('dashboard');
    });

    it('excludes 4xx from the error budget (availability unaffected)', () => {
      recordSliSample('contracts', 200, 50);
      recordSliSample('contracts', 404, 50);
      recordSliSample('contracts', 429, 50);

      const summary = getSliSummary('contracts');
      expect(summary.totalRequests).toBe(3);
      expect(summary.serverErrorRequests).toBe(0);
      expect(summary.availability).toBe(1);
      expect(summary.errorBudgetBurn).toBe(0);
    });

    it('returns zeros for a class with no samples', () => {
      const summary = getSliSummary('global');
      expect(summary.totalRequests).toBe(0);
      expect(summary.serverErrorRequests).toBe(0);
      expect(summary.availability).toBe(1);
      expect(summary.latency.p50).toBe(0);
      expect(summary.latency.p95).toBe(0);
      expect(summary.latency.p99).toBe(0);
    });

    it('sorts latencies before computing percentiles', () => {
      // Insert out of order
      recordSliSample('contracts', 200, 300);
      recordSliSample('contracts', 200, 100);
      recordSliSample('contracts', 200, 200);

      const summary = getSliSummary('contracts');
      expect(summary.latency.p50).toBe(200);
      expect(summary.latency.p95).toBe(300);
      expect(summary.latency.p99).toBe(300);
    });

    it('caps errorBudgetBurn at 10', () => {
      for (let i = 0; i < 10; i++) {
        recordSliSample('dashboard', 500, 100);
      }
      const summary = getSliSummary('dashboard');
      expect(summary.availability).toBe(0);
      expect(summary.errorBudgetBurn).toBe(10);
    });
  });

  describe('getAllSliSummaries', () => {
    it('returns a summary for every route class', () => {
      recordSliSample('dashboard', 200, 10);
      const summaries = getAllSliSummaries();
      expect(summaries).toHaveLength(3);
      const classes = summaries.map((s) => s.routeClass).sort() as SliRouteClass[];
      expect(classes).toEqual(['contracts', 'dashboard', 'global']);
      expect(summaries.find((s) => s.routeClass === 'dashboard')?.totalRequests).toBe(1);
    });
  });

  describe('window pruning', () => {
    it('drops samples older than 30 days from counts and latency', () => {
      jest.useFakeTimers();
      try {
        const now = Date.now();
        jest.setSystemTime(now);
        recordSliSample('global', 500, 10);

        jest.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);
        const summary = getSliSummary('global');
        expect(summary.totalRequests).toBe(0);
        expect(summary.latencySamples).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

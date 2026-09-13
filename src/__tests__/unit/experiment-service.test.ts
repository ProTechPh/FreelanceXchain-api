// @ts-nocheck
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  getExperimentVariant,
  getAllUserExperiments,
  getRegisteredExperiments,
  setVariantOverride,
  clearVariantOverrides,
} from '../../services/experiment-service.js';

describe('Experiment Service (A/B Testing Framework)', () => {
  beforeEach(() => {
    clearVariantOverrides();
  });

  it('should list all registered experiments in the catalog', () => {
    const result = getRegisteredExperiments();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThanOrEqual(4);
      const expIds = result.data.map(e => e.id);
      expect(expIds).toContain('AB-001');
      expect(expIds).toContain('AB-003');
      expect(expIds).toContain('AB-005');
      expect(expIds).toContain('AB-010');
    }
  });

  it('should deterministically assign a variant to a user', () => {
    const res1 = getExperimentVariant('AB-001', 'user-alpha-123', 'freelancer');
    const res2 = getExperimentVariant('AB-001', 'user-alpha-123', 'freelancer');
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    if (res1.success && res2.success) {
      expect(res1.data.variantId).toBe(res2.data.variantId);
      expect(res1.data.experimentId).toBe('AB-001');
    }
  });

  it('should return default variant if user role does not match target audience', () => {
    // AB-001 is targeted to 'freelancer'
    const result = getExperimentVariant('AB-001', 'employer-999', 'employer');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variantId).toBe('control_immediate_paywall');
    }
  });

  it('should return error for non-existent experiment', () => {
    const result = getExperimentVariant('INVALID_EXPERIMENT_ID', 'user-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should respect QA/test variant overrides', () => {
    setVariantOverride('AB-001', 'qa-user', 'trial_three_free_matches');
    const result = getExperimentVariant('AB-001', 'qa-user', 'freelancer');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variantId).toBe('trial_three_free_matches');
      expect(result.data.metadata?.freeMatchesAllowed).toBe(3);
    }
  });

  it('should retrieve all active experiment assignments for a user', () => {
    const result = getAllUserExperiments('user-beta-456', 'freelancer');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThanOrEqual(4);
      const ab001 = result.data.find(e => e.experimentId === 'AB-001');
      expect(ab001).toBeDefined();
    }
  });
});

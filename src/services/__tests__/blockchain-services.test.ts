/**
 * Blockchain Services Integration Tests
 * Tests for Agreement, Milestone, and Dispute blockchain services
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createAgreementOnBlockchain,
  signAgreement,
  completeAgreement,
  verifyAgreementTerms,
  clearBlockchainAgreements,
} from '../agreement-contract.js';
import {
  submitMilestoneToRegistry,
  approveMilestoneOnRegistry,
  getFreelancerStatsFromRegistry,
  getFreelancerPortfolio,
  clearMilestoneRegistry,
} from '../milestone-registry.js';
import {
  createDisputeOnBlockchain,
  resolveDisputeOnBlockchain,
  getUserDisputeStats,
  clearDisputeRegistry,
} from '../dispute-registry.js';
import { clearTransactions } from '../blockchain-client.js';

describe('Agreement Contract', () => {
  const employerWallet = '0x' + 'a'.repeat(40);
  const freelancerWallet = '0x' + 'b'.repeat(40);
  const contractId = 'contract-123';
  const terms = {
    projectTitle: 'Build Website',
    description: 'Create a responsive website',
    milestones: [{ title: 'Design', amount: 1000 }, { title: 'Development', amount: 2000 }],
    deadline: '2025-03-01',
  };

  beforeEach(() => {
    clearBlockchainAgreements();
    clearTransactions();
  });

  it('should create agreement on blockchain', async () => {
    const result = await createAgreementOnBlockchain({
      contractId,
      employerWallet,
      freelancerWallet,
      totalAmount: 3000,
      milestoneCount: 2,
      terms,
    });

    expect(result.agreement.status).toBe('pending');
    expect(result.agreement.employerWallet).toBe(employerWallet);
    expect(result.agreement.freelancerWallet).toBe(freelancerWallet);
    expect(result.agreement.employerSignedAt).toBeDefined();
    expect(result.agreement.freelancerSignedAt).toBeNull();
    expect(result.receipt.status).toBe('success');
  });

  it('should sign agreement by freelancer', async () => {
    await createAgreementOnBlockchain({
      contractId,
      employerWallet,
      freelancerWallet,
      totalAmount: 3000,
      milestoneCount: 2,
      terms,
    });

    const result = await signAgreement(contractId, freelancerWallet);

    expect(result.agreement.status).toBe('signed');
    expect(result.agreement.freelancerSignedAt).toBeDefined();
  });

  it('should verify terms hash', async () => {
    await createAgreementOnBlockchain({
      contractId,
      employerWallet,
      freelancerWallet,
      totalAmount: 3000,
      milestoneCount: 2,
      terms,
    });

    const isValid = await verifyAgreementTerms(contractId, terms);
    expect(isValid).toBe(true);

    const isInvalid = await verifyAgreementTerms(contractId, { ...terms, projectTitle: 'Different' });
    expect(isInvalid).toBe(false);
  });

  it('should complete agreement', async () => {
    await createAgreementOnBlockchain({
      contractId,
      employerWallet,
      freelancerWallet,
      totalAmount: 3000,
      milestoneCount: 2,
      terms,
    });
    await signAgreement(contractId, freelancerWallet);

    const result = await completeAgreement(contractId, employerWallet);
    expect(result.agreement.status).toBe('completed');
  });
});

describe('Milestone Registry', () => {
  const freelancerWallet = '0x' + 'c'.repeat(40);
  const employerWallet = '0x' + 'd'.repeat(40);

  beforeEach(() => {
    clearMilestoneRegistry();
    clearTransactions();
  });

  it('should submit milestone to registry', async () => {
    const result = await submitMilestoneToRegistry({
      milestoneId: 'milestone-1',
      contractId: 'contract-1',
      freelancerWallet,
      employerWallet,
      amount: 1000,
      title: 'Design Phase',
      deliverables: 'Figma designs completed',
    });

    expect(result.record.status).toBe('submitted');
    expect(result.record.title).toBe('Design Phase');
    expect(result.receipt.status).toBe('success');
  });

  it('should approve milestone and update stats', async () => {
    await submitMilestoneToRegistry({
      milestoneId: 'milestone-1',
      contractId: 'contract-1',
      freelancerWallet,
      employerWallet,
      amount: 1000,
      title: 'Design Phase',
      deliverables: 'Figma designs completed',
    });

    const result = await approveMilestoneOnRegistry('milestone-1', employerWallet);
    expect(result.record.status).toBe('approved');
    expect(result.record.completedAt).toBeDefined();

    const stats = await getFreelancerStatsFromRegistry(freelancerWallet);
    expect(stats.completedCount).toBe(1);
    expect(stats.totalEarned).toBe(1000);
  });

  it('should build freelancer portfolio', async () => {
    // Submit and approve multiple milestones
    await submitMilestoneToRegistry({
      milestoneId: 'milestone-1',
      contractId: 'contract-1',
      freelancerWallet,
      employerWallet,
      amount: 1000,
      title: 'Design',
      deliverables: 'Design done',
    });
    await approveMilestoneOnRegistry('milestone-1', employerWallet);

    await submitMilestoneToRegistry({
      milestoneId: 'milestone-2',
      contractId: 'contract-1',
      freelancerWallet,
      employerWallet,
      amount: 2000,
      title: 'Development',
      deliverables: 'Code done',
    });
    await approveMilestoneOnRegistry('milestone-2', employerWallet);

    const portfolio = await getFreelancerPortfolio(freelancerWallet);
    expect(portfolio.length).toBe(2);
    expect(portfolio.every(m => m.status === 'approved')).toBe(true);
  });
});

describe('Dispute Registry', () => {
  const freelancerWallet = '0x' + 'e'.repeat(40);
  const employerWallet = '0x' + 'f'.repeat(40);
  const arbiterWallet = '0x' + '1'.repeat(40);

  beforeEach(() => {
    clearDisputeRegistry();
    clearTransactions();
  });

  it('should create dispute on blockchain', async () => {
    const result = await createDisputeOnBlockchain({
      disputeId: 'dispute-1',
      contractId: 'contract-1',
      milestoneId: 'milestone-1',
      initiatorWallet: employerWallet,
      freelancerWallet,
      employerWallet,
      amount: 1000,
    });

    expect(result.record.outcome).toBe('pending');
    expect(result.record.initiatorWallet).toBe(employerWallet);
    expect(result.receipt.status).toBe('success');
  });

  it('should resolve dispute in freelancer favor', async () => {
    await createDisputeOnBlockchain({
      disputeId: 'dispute-1',
      contractId: 'contract-1',
      milestoneId: 'milestone-1',
      initiatorWallet: employerWallet,
      freelancerWallet,
      employerWallet,
      amount: 1000,
    });

    const result = await resolveDisputeOnBlockchain({
      disputeId: 'dispute-1',
      outcome: 'freelancer_favor',
      reasoning: 'Work was completed as specified',
      arbiterWallet,
    });

    expect(result.record.outcome).toBe('freelancer_favor');
    expect(result.record.reasoning).toBe('Work was completed as specified');
    expect(result.record.arbiterWallet).toBe(arbiterWallet);
    expect(result.record.resolvedAt).toBeDefined();

    const freelancerStats = await getUserDisputeStats(freelancerWallet);
    expect(freelancerStats.won).toBe(1);
    expect(freelancerStats.lost).toBe(0);

    const employerStats = await getUserDisputeStats(employerWallet);
    expect(employerStats.won).toBe(0);
    expect(employerStats.lost).toBe(1);
  });

  it('should resolve dispute in employer favor', async () => {
    await createDisputeOnBlockchain({
      disputeId: 'dispute-2',
      contractId: 'contract-2',
      milestoneId: 'milestone-2',
      initiatorWallet: freelancerWallet,
      freelancerWallet,
      employerWallet,
      amount: 2000,
    });

    const result = await resolveDisputeOnBlockchain({
      disputeId: 'dispute-2',
      outcome: 'employer_favor',
      reasoning: 'Work did not meet requirements',
      arbiterWallet,
    });

    expect(result.record.outcome).toBe('employer_favor');

    const employerStats = await getUserDisputeStats(employerWallet);
    expect(employerStats.won).toBe(1);
  });
});

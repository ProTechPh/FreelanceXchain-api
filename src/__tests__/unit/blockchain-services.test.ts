/**
 * Blockchain Services Integration Tests - Refactored
 * Tests for blockchain service layer functionality
 */
import { describe, it, expect } from '@jest/globals';

describe('Blockchain Services - Refactored', () => {
  describe('Reputation Blockchain Service', () => {
    it('should have submitRatingToBlockchain function', async () => {
      const { submitRatingToBlockchain } = await import('../../services/reputation-blockchain.js');
      expect(typeof submitRatingToBlockchain).toBe('function');
    });

    it('should have getRatingsFromBlockchain function', async () => {
      const { getRatingsFromBlockchain } = await import('../../services/reputation-blockchain.js');
      expect(typeof getRatingsFromBlockchain).toBe('function');
    });

    it('should have getAverageRating function', async () => {
      const { getAverageRating } = await import('../../services/reputation-blockchain.js');
      expect(typeof getAverageRating).toBe('function');
    });

    it('should have getRatingCount function', async () => {
      const { getRatingCount } = await import('../../services/reputation-blockchain.js');
      expect(typeof getRatingCount).toBe('function');
    });

    it('should have getTotalRatings function', async () => {
      const { getTotalRatings } = await import('../../services/reputation-blockchain.js');
      expect(typeof getTotalRatings).toBe('function');
    });

    it('should have getReputationContractAddress function', async () => {
      const { getReputationContractAddress } = await import('../../services/reputation-blockchain.js');
      expect(typeof getReputationContractAddress).toBe('function');
    });
  });

  describe('Escrow Blockchain Service', () => {
    it('should have deployEscrowContract function', async () => {
      const { deployEscrowContract } = await import('../../services/escrow-blockchain.js');
      expect(typeof deployEscrowContract).toBe('function');
    });

    it('should have submitMilestone function', async () => {
      const { submitMilestone } = await import('../../services/escrow-blockchain.js');
      expect(typeof submitMilestone).toBe('function');
    });

    it('should have approveMilestone function', async () => {
      const { approveMilestone } = await import('../../services/escrow-blockchain.js');
      expect(typeof approveMilestone).toBe('function');
    });

    it('should have getMilestone function', async () => {
      const { getMilestone } = await import('../../services/escrow-blockchain.js');
      expect(typeof getMilestone).toBe('function');
    });

    it('should have disputeMilestone function', async () => {
      const { disputeMilestone } = await import('../../services/escrow-blockchain.js');
      expect(typeof disputeMilestone).toBe('function');
    });

    it('should have resolveDispute function', async () => {
      const { resolveDispute } = await import('../../services/escrow-blockchain.js');
      expect(typeof resolveDispute).toBe('function');
    });

    it('should have getEscrowInfo function', async () => {
      const { getEscrowInfo } = await import('../../services/escrow-blockchain.js');
      expect(typeof getEscrowInfo).toBe('function');
    });

    it('should have getAllMilestones function', async () => {
      const { getAllMilestones } = await import('../../services/escrow-blockchain.js');
      expect(typeof getAllMilestones).toBe('function');
    });
  });

  describe('Agreement Blockchain Service', () => {
    it('should have createAgreementOnBlockchain function', async () => {
      const { createAgreementOnBlockchain } = await import('../../services/agreement-blockchain.js');
      expect(typeof createAgreementOnBlockchain).toBe('function');
    });

    it('should have signAgreement function', async () => {
      const { signAgreement } = await import('../../services/agreement-blockchain.js');
      expect(typeof signAgreement).toBe('function');
    });

    it('should have getAgreementFromBlockchain function', async () => {
      const { getAgreementFromBlockchain } = await import('../../services/agreement-blockchain.js');
      expect(typeof getAgreementFromBlockchain).toBe('function');
    });

    it('should have completeAgreement function', async () => {
      const { completeAgreement } = await import('../../services/agreement-blockchain.js');
      expect(typeof completeAgreement).toBe('function');
    });

    it('should have cancelAgreement function', async () => {
      const { cancelAgreement } = await import('../../services/agreement-blockchain.js');
      expect(typeof cancelAgreement).toBe('function');
    });

    it('should have disputeAgreement function', async () => {
      const { disputeAgreement } = await import('../../services/agreement-blockchain.js');
      expect(typeof disputeAgreement).toBe('function');
    });

    it('should generate consistent contract ID hash', async () => {
      const { generateContractIdHash } = await import('../../services/agreement-blockchain.js');
      const contractId = 'test-contract-123';
      const hash1 = generateContractIdHash(contractId);
      const hash2 = generateContractIdHash(contractId);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should generate different hashes for different contract IDs', async () => {
      const { generateContractIdHash } = await import('../../services/agreement-blockchain.js');
      const hash1 = generateContractIdHash('contract-123');
      const hash2 = generateContractIdHash('contract-456');
      expect(hash1).not.toBe(hash2);
    });

    it('should generate terms hash', async () => {
      const { generateTermsHash } = await import('../../services/agreement-blockchain.js');
      const terms = {
        projectTitle: 'Test Project',
        description: 'Test project description',
        milestones: [
          { title: 'Milestone 1', amount: 1000 },
          { title: 'Milestone 2', amount: 2000 }
        ],
        deadline: '2024-12-31',
      };
      const hash = generateTermsHash(terms);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should have getAgreementStatusString function', async () => {
      const { getAgreementStatusString } = await import('../../services/agreement-blockchain.js');
      expect(getAgreementStatusString(0)).toBe('pending');
      expect(getAgreementStatusString(1)).toBe('signed');
      expect(getAgreementStatusString(2)).toBe('completed');
      expect(getAgreementStatusString(3)).toBe('disputed');
      expect(getAgreementStatusString(4)).toBe('cancelled');
    });
  });

  describe('Web3 Client Utilities', () => {
    it('should have isWeb3Available function', async () => {
      const { isWeb3Available } = await import('../../services/web3-client.js');
      expect(typeof isWeb3Available).toBe('function');
    });

    it('should validate Ethereum addresses correctly', async () => {
      const { isValidAddress } = await import('../../services/web3-client.js');
      // Valid addresses
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0xABCDEF1234567890123456789012345678901234')).toBe(true);
      // Invalid addresses
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });

    it('should format and parse ether correctly', async () => {
      const { formatEther, parseEther } = await import('../../services/web3-client.js');
      const wei = parseEther('1');
      expect(wei).toBe(BigInt('1000000000000000000'));
      const eth = formatEther(BigInt('1000000000000000000'));
      expect(eth).toBe('1.0');
      const wei2 = parseEther('0.5');
      expect(wei2).toBe(BigInt('500000000000000000'));
      const eth2 = formatEther(BigInt('500000000000000000'));
      expect(eth2).toBe('0.5');
    });
  });
});

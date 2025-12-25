/**
 * KYC Blockchain Contract Tests
 * Tests for on-chain KYC verification functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  submitKycToBlockchain,
  approveKycOnBlockchain,
  rejectKycOnBlockchain,
  isWalletVerified,
  getKycFromBlockchain,
  verifyKycDataHash,
  generateKycDataHash,
  generateUserIdHash,
  clearBlockchainKyc,
  getAllVerifiedWallets,
  getKycContractAddress,
} from '../kyc-contract.js';
import { clearTransactions } from '../blockchain-client.js';

describe('KYC Blockchain Contract', () => {
  const testWallet = '0x' + 'a'.repeat(40);
  const testUserId = 'user-123';
  const verifierWallet = '0x' + 'b'.repeat(40);
  
  const testKycData = {
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    dateOfBirth: '1990-01-15',
    nationality: 'PH',
    documentType: 'passport',
    documentNumber: 'P1234567',
  };

  beforeEach(() => {
    clearBlockchainKyc();
    clearTransactions();
  });

  describe('generateKycDataHash', () => {
    it('should generate consistent hash for same data', () => {
      const hash1 = generateKycDataHash(testKycData);
      const hash2 = generateKycDataHash(testKycData);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should generate different hash for different data', () => {
      const hash1 = generateKycDataHash(testKycData);
      const hash2 = generateKycDataHash({ ...testKycData, firstName: 'Maria' });
      
      expect(hash1).not.toBe(hash2);
    });

    it('should normalize data before hashing (case insensitive names)', () => {
      const hash1 = generateKycDataHash(testKycData);
      const hash2 = generateKycDataHash({ ...testKycData, firstName: 'JUAN', lastName: 'DELA CRUZ' });
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('generateUserIdHash', () => {
    it('should generate consistent hash for same userId', () => {
      const hash1 = generateUserIdHash(testUserId);
      const hash2 = generateUserIdHash(testUserId);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('submitKycToBlockchain', () => {
    it('should submit KYC verification to blockchain', async () => {
      const result = await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      expect(result.verification).toBeDefined();
      expect(result.verification.walletAddress).toBe(testWallet);
      expect(result.verification.userId).toBe(testUserId);
      expect(result.verification.status).toBe('pending');
      expect(result.verification.tier).toBe('none');
      expect(result.verification.dataHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.receipt.status).toBe('success');
      expect(result.receipt.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should reject duplicate pending submission', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      await expect(submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      })).rejects.toThrow('Verification already pending or approved');
    });

    it('should allow resubmission after rejection', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      await rejectKycOnBlockchain(testWallet, 'Document expired', verifierWallet);

      const result = await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      expect(result.verification.status).toBe('pending');
    });
  });

  describe('approveKycOnBlockchain', () => {
    it('should approve pending KYC verification', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      const result = await approveKycOnBlockchain(
        { walletAddress: testWallet, tier: 'standard', validityDays: 365 },
        verifierWallet
      );

      expect(result.verification.status).toBe('approved');
      expect(result.verification.tier).toBe('standard');
      expect(result.verification.verifiedBy).toBe(verifierWallet);
      expect(result.verification.verifiedAt).toBeDefined();
      expect(result.verification.expiresAt).toBeDefined();
      expect(result.receipt.status).toBe('success');
    });

    it('should reject approval for non-existent wallet', async () => {
      await expect(approveKycOnBlockchain(
        { walletAddress: testWallet, tier: 'basic', validityDays: 365 },
        verifierWallet
      )).rejects.toThrow('No KYC verification found');
    });

    it('should reject approval for non-pending verification', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      await approveKycOnBlockchain(
        { walletAddress: testWallet, tier: 'basic', validityDays: 365 },
        verifierWallet
      );

      await expect(approveKycOnBlockchain(
        { walletAddress: testWallet, tier: 'enhanced', validityDays: 365 },
        verifierWallet
      )).rejects.toThrow('KYC verification is not pending');
    });
  });

  describe('rejectKycOnBlockchain', () => {
    it('should reject pending KYC verification', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      const result = await rejectKycOnBlockchain(
        testWallet,
        'Document is expired',
        verifierWallet
      );

      expect(result.verification.status).toBe('rejected');
      expect(result.verification.rejectionReason).toBe('Document is expired');
      expect(result.verification.verifiedBy).toBe(verifierWallet);
      expect(result.receipt.status).toBe('success');
    });

    it('should reject for non-pending verification', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      await rejectKycOnBlockchain(testWallet, 'First rejection', verifierWallet);

      await expect(rejectKycOnBlockchain(
        testWallet,
        'Second rejection',
        verifierWallet
      )).rejects.toThrow('KYC verification is not pending');
    });
  });

  describe('isWalletVerified', () => {
    it('should return false for unverified wallet', async () => {
      const result = await isWalletVerified(testWallet);
      
      expect(result.isVerified).toBe(false);
      expect(result.tier).toBe('none');
      expect(result.expiresAt).toBeNull();
    });

    it('should return false for pending verification', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      const result = await isWalletVerified(testWallet);
      
      expect(result.isVerified).toBe(false);
    });

    it('should return true for approved verification', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      await approveKycOnBlockchain(
        { walletAddress: testWallet, tier: 'enhanced', validityDays: 365 },
        verifierWallet
      );

      const result = await isWalletVerified(testWallet);
      
      expect(result.isVerified).toBe(true);
      expect(result.tier).toBe('enhanced');
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should return false for rejected verification', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      await rejectKycOnBlockchain(testWallet, 'Invalid document', verifierWallet);

      const result = await isWalletVerified(testWallet);
      
      expect(result.isVerified).toBe(false);
    });
  });

  describe('getKycFromBlockchain', () => {
    it('should return null for unknown wallet', async () => {
      const result = await getKycFromBlockchain(testWallet);
      expect(result).toBeNull();
    });

    it('should return full verification details', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      await approveKycOnBlockchain(
        { walletAddress: testWallet, tier: 'standard', validityDays: 180 },
        verifierWallet
      );

      const result = await getKycFromBlockchain(testWallet);
      
      expect(result).not.toBeNull();
      expect(result!.walletAddress).toBe(testWallet);
      expect(result!.userId).toBe(testUserId);
      expect(result!.status).toBe('approved');
      expect(result!.tier).toBe('standard');
      expect(result!.dataHash).toBeDefined();
      expect(result!.transactionHash).toBeDefined();
      expect(result!.blockNumber).toBeDefined();
    });
  });

  describe('verifyKycDataHash', () => {
    it('should return true for matching data', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      const isValid = await verifyKycDataHash(testWallet, testKycData);
      expect(isValid).toBe(true);
    });

    it('should return false for non-matching data', async () => {
      await submitKycToBlockchain({
        userId: testUserId,
        walletAddress: testWallet,
        kycData: testKycData,
      });

      const isValid = await verifyKycDataHash(testWallet, {
        ...testKycData,
        documentNumber: 'DIFFERENT123',
      });
      expect(isValid).toBe(false);
    });

    it('should return false for unknown wallet', async () => {
      const isValid = await verifyKycDataHash(testWallet, testKycData);
      expect(isValid).toBe(false);
    });
  });

  describe('getAllVerifiedWallets', () => {
    it('should return empty array when no verified wallets', async () => {
      const result = await getAllVerifiedWallets();
      expect(result).toEqual([]);
    });

    it('should return only approved wallets', async () => {
      // Submit and approve first wallet
      await submitKycToBlockchain({
        userId: 'user-1',
        walletAddress: '0x' + '1'.repeat(40),
        kycData: testKycData,
      });
      await approveKycOnBlockchain(
        { walletAddress: '0x' + '1'.repeat(40), tier: 'basic', validityDays: 365 },
        verifierWallet
      );

      // Submit but don't approve second wallet
      await submitKycToBlockchain({
        userId: 'user-2',
        walletAddress: '0x' + '2'.repeat(40),
        kycData: { ...testKycData, firstName: 'Maria' },
      });

      // Submit and reject third wallet
      await submitKycToBlockchain({
        userId: 'user-3',
        walletAddress: '0x' + '3'.repeat(40),
        kycData: { ...testKycData, firstName: 'Pedro' },
      });
      await rejectKycOnBlockchain('0x' + '3'.repeat(40), 'Invalid', verifierWallet);

      const result = await getAllVerifiedWallets();
      
      expect(result.length).toBe(1);
      expect(result[0]?.walletAddress).toBe('0x' + '1'.repeat(40));
    });
  });

  describe('getKycContractAddress', () => {
    it('should return a valid contract address', () => {
      const address = getKycContractAddress();
      expect(address).toMatch(/^0x[a-f0-9]{40}$/);
    });
  });
});

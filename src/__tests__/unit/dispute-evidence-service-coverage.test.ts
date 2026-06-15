// @ts-nocheck
/**
 * Coverage for dispute-evidence-service.ts branches.
 * Targets: fileUrl falsy, ?? '' fallbacks, conditional spreads, ternary operators
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockDisputeRepository = {
  getDisputeById: jest.fn(),
};

const mockContractRepository = {
  getContractById: jest.fn(),
};

const mockDisputeEvidenceRepository = {
  createEvidence: jest.fn(),
  findByDispute: jest.fn(),
  getEvidenceById: jest.fn(),
  updateEvidence: jest.fn(),
  deleteEvidence: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/dispute-evidence-repository.ts'), () => ({
  disputeEvidenceRepository: mockDisputeEvidenceRepository,
}));

const mockCreateNotification = jest.fn<any>();
const mockSendNotificationToUser = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: mockCreateNotification,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: mockSendNotificationToUser,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id-1',
}));

function makeDisputeEntity(overrides: Record<string, any> = {}) {
  return {
    id: 'dispute-1',
    contract_id: 'contract-1',
    milestone_id: 'milestone-1',
    initiator_id: 'freelancer-1',
    reason: 'Dispute reason',
    evidence: [],
    status: 'open',
    resolution: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeContractEntity(overrides: Record<string, any> = {}) {
  return {
    id: 'contract-1',
    project_id: 'project-1',
    proposal_id: 'proposal-1',
    freelancer_id: 'freelancer-1',
    employer_id: 'employer-1',
    escrow_address: '0xabc',
    base_amount: 1000,
    rush_fee: 0,
    total_amount: 1000,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Dispute Evidence Service - branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDisputeRepository.getDisputeById.mockReset();
    mockContractRepository.getContractById.mockReset();
    mockDisputeEvidenceRepository.createEvidence.mockReset();
    mockDisputeEvidenceRepository.findByDispute.mockReset();
    mockDisputeEvidenceRepository.getEvidenceById.mockReset();
    mockDisputeEvidenceRepository.updateEvidence.mockReset();
    mockDisputeEvidenceRepository.deleteEvidence.mockReset();
    mockCreateNotification.mockReset();
    mockSendNotificationToUser.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/dispute-evidence-service.js');
  };

  describe('submitEvidence - fileUrl falsy path', () => {
    it('should not set file_url when fileUrl is falsy', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'No file',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockCreateNotification.mockResolvedValue({ success: true, data: { id: 'notif-1' } });
      mockSendNotificationToUser.mockReturnValue({ success: true });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: undefined,
        description: 'No file',
      });

      expect(result.success).toBe(true);
      // Verify createEvidence was called without file_url
      const callArgs = mockDisputeEvidenceRepository.createEvidence.mock.calls[0][0];
      expect(callArgs.file_url).toBeUndefined();
    });

    it('should set file_url when fileUrl is provided', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        file_url: 'https://file.com/doc.pdf',
        description: 'With file',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockCreateNotification.mockResolvedValue({ success: true, data: { id: 'notif-1' } });
      mockSendNotificationToUser.mockReturnValue({ success: true });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'With file',
      });

      expect(result.success).toBe(true);
      const callArgs = mockDisputeEvidenceRepository.createEvidence.mock.calls[0][0];
      expect(callArgs.file_url).toBe('https://file.com/doc.pdf');
    });
  });

  describe('submitEvidence - fallback for undefined fileUrl', () => {
    it('should return empty string when createdEvidence.file_url is undefined', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        file_url: undefined,
        description: 'No file url',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockCreateNotification.mockResolvedValue({ success: true, data: { id: 'notif-1' } });
      mockSendNotificationToUser.mockReturnValue({ success: true });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        description: 'No file url',
      });

      expect(result.success).toBe(true);
      expect(result.data.fileUrl).toBe('');
    });
  });

  describe('submitEvidence - conditional spreads for verified_by/verified_at', () => {
    it('should not include verifiedBy/verifiedAt when not present', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Unverified',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        verified_by: undefined,
        verified_at: undefined,
      });
      mockCreateNotification.mockResolvedValue({ success: true, data: { id: 'notif-1' } });
      mockSendNotificationToUser.mockReturnValue({ success: true });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        description: 'Unverified',
      });

      expect(result.success).toBe(true);
      expect(result.data.verifiedBy).toBeUndefined();
      expect(result.data.verifiedAt).toBeUndefined();
    });

    it('should include verifiedBy/verifiedAt when present', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Verified',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        verified_by: 'arbiter-1',
        verified_at: '2025-01-01T00:00:00.000Z',
      });
      mockCreateNotification.mockResolvedValue({ success: true, data: { id: 'notif-1' } });
      mockSendNotificationToUser.mockReturnValue({ success: true });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        description: 'Verified',
      });

      expect(result.success).toBe(true);
      expect(result.data.verifiedBy).toBe('arbiter-1');
      expect(result.data.verifiedAt).toBeDefined();
    });
  });

  describe('submitEvidence - ternary for otherPartyId (employer submits)', () => {
    it('should notify freelancer when employer submits', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'employer-1',
        evidence_type: 'document',
        description: 'From employer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockCreateNotification.mockResolvedValue({ success: true, data: { id: 'notif-1' } });
      mockSendNotificationToUser.mockReturnValue({ success: true });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'employer-1',
        evidenceType: 'document',
        description: 'From employer',
      });

      expect(result.success).toBe(true);
      // The other party notification should be for the freelancer
      const otherPartyNotification = mockCreateNotification.mock.calls[0][0];
      expect(otherPartyNotification.userId).toBe('freelancer-1');
    });
  });

  describe('submitEvidence - notificationResult.success false', () => {
    it('should not call sendNotificationToUser when notification fails', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({ resolution: null }));
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockCreateNotification.mockResolvedValue({ success: false, error: { message: 'Notification failed' } });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        description: 'Test',
      });

      expect(result.success).toBe(true);
      expect(mockSendNotificationToUser).not.toHaveBeenCalled();
    });
  });

  describe('submitEvidence - error not instanceof Error', () => {
    it('should handle non-Error thrown values', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockRejectedValueOnce('string error');

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        description: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBMIT_FAILED');
      expect(result.error.message).toBe('Failed to submit evidence');
    });
  });

  describe('submitEvidence - contract not found', () => {
    it('should fail when contract not found', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        description: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    });
  });

  describe('getDisputeEvidence - fallback for undefined fileUrl', () => {
    it('should return empty string when file_url is undefined', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
        {
          id: 'ev-1',
          dispute_id: 'dispute-1',
          submitted_by: 'freelancer-1',
          evidence_type: 'document',
          file_url: undefined,
          description: 'No file',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      const result = await getDisputeEvidence('dispute-1', 'freelancer-1');

      expect(result.success).toBe(true);
      expect(result.data[0].fileUrl).toBe('');
    });
  });

  describe('getDisputeEvidence - conditional spreads', () => {
    it('should not include verifiedBy/verifiedAt when not present', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
        {
          id: 'ev-1',
          dispute_id: 'dispute-1',
          submitted_by: 'freelancer-1',
          evidence_type: 'document',
          description: 'Unverified',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          verified_by: undefined,
          verified_at: undefined,
        },
      ]);

      const result = await getDisputeEvidence('dispute-1', 'freelancer-1');

      expect(result.success).toBe(true);
      expect(result.data[0].verifiedBy).toBeUndefined();
      expect(result.data[0].verifiedAt).toBeUndefined();
    });

    it('should include verifiedBy/verifiedAt when present', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
        {
          id: 'ev-1',
          dispute_id: 'dispute-1',
          submitted_by: 'freelancer-1',
          evidence_type: 'document',
          description: 'Verified',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          verified_by: 'arbiter-1',
          verified_at: '2025-01-01T00:00:00.000Z',
        },
      ]);

      const result = await getDisputeEvidence('dispute-1', 'freelancer-1');

      expect(result.success).toBe(true);
      expect(result.data[0].verifiedBy).toBe('arbiter-1');
      expect(result.data[0].verifiedAt).toBeDefined();
    });
  });

  describe('getDisputeEvidence - contract not found', () => {
    it('should fail when contract not found', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await getDisputeEvidence('dispute-1', 'freelancer-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    });
  });

  describe('verifyEvidence - fallback for undefined fileUrl', () => {
    it('should return empty string when file_url is undefined', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        file_url: undefined,
        description: 'No file',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: { decision: 'freelancer_favor', resolved_by: 'arbiter-1' },
      }));

      mockDisputeEvidenceRepository.updateEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        file_url: undefined,
        description: 'No file',
        verified_by: 'arbiter-1',
        verified_at: '2025-01-01',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await verifyEvidence({ evidenceId: 'ev-1', verifiedBy: 'arbiter-1' });

      expect(result.success).toBe(true);
      expect(result.data.fileUrl).toBe('');
    });
  });

  describe('verifyEvidence - conditional spreads', () => {
    it('should not include verifiedBy/verifiedAt when not present in updated entity', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: { decision: 'freelancer_favor', resolved_by: 'arbiter-1' },
      }));

      mockDisputeEvidenceRepository.updateEvidence.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Test',
        verified_by: undefined,
        verified_at: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await verifyEvidence({ evidenceId: 'ev-1', verifiedBy: 'arbiter-1' });

      expect(result.success).toBe(true);
      expect(result.data.verifiedBy).toBeUndefined();
      expect(result.data.verifiedAt).toBeUndefined();
    });
  });

  describe('verifyEvidence - dispute not found', () => {
    it('should fail when dispute not found', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(null);

      const result = await verifyEvidence({ evidenceId: 'ev-1', verifiedBy: 'arbiter-1' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EVIDENCE_NOT_FOUND');
    });
  });

  describe('verifyEvidence - error not instanceof Error', () => {
    it('should handle non-Error thrown values', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockRejectedValueOnce('string error');

      const result = await verifyEvidence({ evidenceId: 'ev-1', verifiedBy: 'arbiter-1' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VERIFY_FAILED');
      expect(result.error.message).toBe('Failed to verify evidence');
    });
  });

  describe('deleteEvidence - error not instanceof Error', () => {
    it('should handle non-Error thrown values', async () => {
      const { deleteEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockRejectedValueOnce('string error');

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DELETE_FAILED');
      expect(result.error.message).toBe('Failed to delete evidence');
    });
  });

  describe('getDisputeEvidence - error not instanceof Error', () => {
    it('should handle non-Error thrown values', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockRejectedValueOnce('string error');

      const result = await getDisputeEvidence('dispute-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
      expect(result.error.message).toBe('Failed to get evidence');
    });
  });
});

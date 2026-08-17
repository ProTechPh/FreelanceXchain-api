// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
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

const mockCreateNotification = jest.fn<any>().mockResolvedValue({ success: true, data: { id: 'notif-1' } });
const mockSendNotificationToUser = jest.fn<any>().mockReturnValue({ success: true });

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: mockCreateNotification,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: mockSendNotificationToUser,
  notificationEmitter: { emitToUser: jest.fn() },
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

function makeEvidenceEntity(overrides: Record<string, any> = {}) {
  return {
    id: 'ev-1',
    dispute_id: 'dispute-1',
    submitted_by: 'freelancer-1',
    evidence_type: 'document',
    file_url: 'https://file.com/doc.pdf',
    description: 'Work proof',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Dispute Evidence Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDisputeRepository.getDisputeById.mockReset();
    mockContractRepository.getContractById.mockReset();
    mockDisputeEvidenceRepository.createEvidence.mockReset();
    mockDisputeEvidenceRepository.findByDispute.mockReset();
    mockDisputeEvidenceRepository.getEvidenceById.mockReset();
    mockDisputeEvidenceRepository.updateEvidence.mockReset();
    mockDisputeEvidenceRepository.deleteEvidence.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/dispute-evidence-service.js');
  };

  describe('submitEvidence', () => {
    it('should submit evidence successfully', async () => {
      const { submitEvidence } = await importModule();

      // Mock dispute with arbiter resolution
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: { decision: 'freelancer_favor', reasoning: '', resolved_by: 'arbiter-1', resolved_at: new Date().toISOString() },
      }));
      // Mock contract
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce(makeEvidenceEntity());

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Work proof',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe('ev-1');
      expect(result.data.disputeId).toBe('dispute-1');
      expect(result.data.submittedBy).toBe('freelancer-1');
      expect(result.data.evidenceType).toBe('document');
      expect(result.data.fileUrl).toBe('https://file.com/doc.pdf');
      expect(result.data.description).toBe('Work proof');
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    });

    it('should submit evidence when no arbiter assigned', async () => {
      const { submitEvidence } = await importModule();

      // Mock dispute without resolution (no arbiter)
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: null,
      }));
      // Mock contract
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce(makeEvidenceEntity());

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'screenshot',
        fileUrl: 'https://file.com/img.png',
        description: 'Screenshot',
      });

      expect(result.success).toBe(true);
      // Only notify other party, not arbiter
      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    });

    it('should fail when dispute not found', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(null);

      const result = await submitEvidence({
        disputeId: 'nonexistent',
        submittedBy: 'user-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    });

    it('should fail when user is not involved in dispute', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'outsider',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle insert failure', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.createEvidence.mockRejectedValueOnce(new Error('Insert failed'));

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBMIT_FAILED');
    });

    it('should handle database errors', async () => {
      const { submitEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockRejectedValueOnce(new Error('DB error'));

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBMIT_FAILED');
    });
  });

  describe('getDisputeEvidence', () => {
    it('should return evidence for authorized user (freelancer)', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());

      const evidenceList = [
        makeEvidenceEntity({ id: 'ev-1', submitted_by: 'freelancer-1' }),
        makeEvidenceEntity({ id: 'ev-2', submitted_by: 'employer-1' }),
      ];
      mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce(evidenceList);

      const result = await getDisputeEvidence('dispute-1', 'freelancer-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should allow arbiter to view evidence', async () => {
      const { getDisputeEvidence } = await importModule();

      // Mock dispute with resolution indicating arbiter
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: { decision: 'freelancer_favor', reasoning: '', resolved_by: 'arbiter-1', resolved_at: new Date().toISOString() },
      }));
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
      mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([makeEvidenceEntity()]);

      const result = await getDisputeEvidence('dispute-1', 'arbiter-1');

      expect(result.success).toBe(true);
    });

    it('should fail when dispute not found', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(null);

      const result = await getDisputeEvidence('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    });

    it('should fail when user is not authorized', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
      mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());

      const result = await getDisputeEvidence('dispute-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getDisputeEvidence } = await importModule();

      mockDisputeRepository.getDisputeById.mockRejectedValueOnce(new Error('DB error'));

      const result = await getDisputeEvidence('dispute-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('deleteEvidence', () => {
    it('should delete evidence successfully', async () => {
      const { deleteEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        submitted_by: 'user-1',
        verified_at: undefined,
      });
      mockDisputeEvidenceRepository.deleteEvidence.mockResolvedValueOnce(true);

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(true);
    });

    it('should fail when evidence not found', async () => {
      const { deleteEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce(null);

      const result = await deleteEvidence('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EVIDENCE_NOT_FOUND');
    });

    it('should fail when user is not the submitter', async () => {
      const { deleteEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        submitted_by: 'other-user',
        verified_at: undefined,
      });

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when evidence is already verified', async () => {
      const { deleteEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        submitted_by: 'user-1',
        verified_at: '2025-01-01',
      });

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_VERIFIED');
    });

    it('should handle database errors', async () => {
      const { deleteEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockRejectedValueOnce(new Error('DB error'));

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DELETE_FAILED');
    });
  });

  describe('verifyEvidence', () => {
    it('should verify evidence successfully', async () => {
      const { verifyEvidence } = await importModule();

      // Mock evidence with dispute_id
      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Proof',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Mock dispute with arbiter
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: { decision: 'freelancer_favor', reasoning: '', resolved_by: 'arbiter-1', resolved_at: new Date().toISOString() },
      }));

      const updated = {
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Proof',
        verified_by: 'arbiter-1',
        verified_at: '2025-01-01',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDisputeEvidenceRepository.updateEvidence.mockResolvedValueOnce(updated);

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(true);
      expect(result.data.verifiedBy).toBe('arbiter-1');
    });

    it('should fail when evidence not found', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce(null);

      const result = await verifyEvidence({
        evidenceId: 'nonexistent',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EVIDENCE_NOT_FOUND');
    });

    it('should fail when user is not the arbiter', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Proof',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Mock dispute with different arbiter
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: { decision: 'freelancer_favor', reasoning: '', resolved_by: 'other-arbiter', resolved_at: new Date().toISOString() },
      }));

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle update failure', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        evidence_type: 'document',
        description: 'Proof',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
        resolution: { decision: 'freelancer_favor', reasoning: '', resolved_by: 'arbiter-1', resolved_at: new Date().toISOString() },
      }));

      mockDisputeEvidenceRepository.updateEvidence.mockResolvedValueOnce(null);

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VERIFY_FAILED');
    });

    it('should handle database errors', async () => {
      const { verifyEvidence } = await importModule();

      mockDisputeEvidenceRepository.getEvidenceById.mockRejectedValueOnce(new Error('DB error'));

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VERIFY_FAILED');
    });
  });
});

describe('Dispute Evidence Service - Branch Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDisputeRepository.getDisputeById.mockReset();
    mockContractRepository.getContractById.mockReset();
    mockDisputeEvidenceRepository.createEvidence.mockReset();
    mockDisputeEvidenceRepository.findByDispute.mockReset();
    mockDisputeEvidenceRepository.getEvidenceById.mockReset();
    mockDisputeEvidenceRepository.updateEvidence.mockReset();
    mockDisputeEvidenceRepository.deleteEvidence.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/dispute-evidence-service.js');
  };

  it('submitEvidence without fileUrl - file_url ?? fallback', async () => {
    const { submitEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce({
      ...makeEvidenceEntity({ file_url: null }),
    });
    const result = await submitEvidence({
      disputeId: 'dispute-1',
      submittedBy: 'freelancer-1',
      evidenceType: 'document',
      description: 'No file',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileUrl).toBe('');
    }
  });

  it('getDisputeEvidence with unverified evidence - verified_by/at null', async () => {
    const { getDisputeEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
      makeEvidenceEntity({ verified_by: null, verified_at: null, file_url: null }),
    ]);
    const result = await getDisputeEvidence('dispute-1', 'freelancer-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].verifiedBy).toBeUndefined();
      expect(result.data[0].verifiedAt).toBeUndefined();
      expect(result.data[0].fileUrl).toBe('');
    }
  });

  it('submitEvidence with employer as submitter - otherPartyId is freelancer', async () => {
    const { submitEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce(makeEvidenceEntity({ submitted_by: 'employer-1' }));
    const result = await submitEvidence({
      disputeId: 'dispute-1',
      submittedBy: 'employer-1',
      evidenceType: 'document',
      description: 'Employer proof',
    });
    expect(result.success).toBe(true);
  });

  it('submitEvidence non-Error throw in catch', async () => {
    const { submitEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockRejectedValueOnce('raw string error');
    const result = await submitEvidence({
      disputeId: 'dispute-1',
      submittedBy: 'freelancer-1',
      evidenceType: 'document',
      description: 'test',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed to submit evidence');
    }
  });

  it('getDisputeEvidence non-Error throw in catch', async () => {
    const { getDisputeEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockRejectedValueOnce(42);
    const result = await getDisputeEvidence('dispute-1', 'user-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed to get evidence');
    }
  });

  it('deleteEvidence non-Error throw in catch', async () => {
    const { deleteEvidence } = await importModule();
    mockDisputeEvidenceRepository.getEvidenceById.mockRejectedValueOnce(null);
    const result = await deleteEvidence('ev-1', 'user-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed to delete evidence');
    }
  });

  it('verifyEvidence non-Error throw in catch', async () => {
    const { verifyEvidence } = await importModule();
    mockDisputeEvidenceRepository.getEvidenceById.mockRejectedValueOnce('timeout');
    const result = await verifyEvidence({ evidenceId: 'ev-1', verifiedBy: 'arbiter-1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed to verify evidence');
    }
  });
});

describe('Dispute Evidence Service - Additional Branch Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDisputeRepository.getDisputeById.mockReset();
    mockContractRepository.getContractById.mockReset();
    mockDisputeEvidenceRepository.createEvidence.mockReset();
    mockDisputeEvidenceRepository.findByDispute.mockReset();
    mockDisputeEvidenceRepository.getEvidenceById.mockReset();
    mockDisputeEvidenceRepository.updateEvidence.mockReset();
    mockDisputeEvidenceRepository.deleteEvidence.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/dispute-evidence-service.js');
  };

  it('L78-79: verified_by truthy spread includes verifiedBy in getDisputeEvidence', async () => {
    const { getDisputeEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
      {
        id: 'ev-1',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        file_url: 'https://example.com/file.pdf',
        evidence_type: 'document',
        description: 'Evidence doc',
        verified_by: 'arbiter-1',
        verified_at: '2025-01-15T10:00:00Z',
        created_at: '2025-01-10T10:00:00Z',
        updated_at: '2025-01-10T10:00:00Z',
      },
    ]);

    const result = await getDisputeEvidence('dispute-1', 'freelancer-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].verifiedBy).toBe('arbiter-1');
      expect(result.data[0].verifiedAt).toBeDefined();
    }
  });

  it('L78-79: verified_by falsy spread omits verifiedBy in getDisputeEvidence', async () => {
    const { getDisputeEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
      {
        id: 'ev-2',
        dispute_id: 'dispute-1',
        submitted_by: 'freelancer-1',
        file_url: 'https://example.com/file2.pdf',
        evidence_type: 'document',
        description: 'Evidence doc 2',
        verified_by: null,
        verified_at: null,
        created_at: '2025-01-10T10:00:00Z',
        updated_at: '2025-01-10T10:00:00Z',
      },
    ]);

    const result = await getDisputeEvidence('dispute-1', 'freelancer-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).not.toHaveProperty('verifiedBy');
      expect(result.data[0]).not.toHaveProperty('verifiedAt');
    }
  });

  it('L185-186: verified_by truthy spread in getDisputeEvidence list', async () => {
    const { getDisputeEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
      {
        id: 'ev-1', dispute_id: 'dispute-1', submitted_by: 'freelancer-1',
        file_url: 'https://example.com/file.pdf', evidence_type: 'document',
        description: 'Doc',
        verified_by: 'arbiter-1', verified_at: '2025-01-15T10:00:00Z',
        created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z',
      },
    ]);

    const result = await getDisputeEvidence('dispute-1', 'freelancer-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].verifiedBy).toBe('arbiter-1');
      expect(result.data[0].verifiedAt).toBeDefined();
    }
  });

  it('L315-316: verified_by falsy spread in getDisputeEvidence list', async () => {
    const { getDisputeEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity());
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    mockDisputeEvidenceRepository.findByDispute.mockResolvedValueOnce([
      {
        id: 'ev-1', dispute_id: 'dispute-1', submitted_by: 'freelancer-1',
        file_url: 'https://example.com/file.pdf', evidence_type: 'document',
        description: 'Doc',
        verified_by: null, verified_at: null,
        created_at: '2025-01-10T10:00:00Z', updated_at: '2025-01-10T10:00:00Z',
      },
    ]);

    const result = await getDisputeEvidence('dispute-1', 'freelancer-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).not.toHaveProperty('verifiedBy');
    }
  });

  it('L78-79: submitEvidence created entity with verified_by truthy spreads the field', async () => {
    const { submitEvidence } = await importModule();

    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
      resolution: { decision: 'freelancer_favor', reasoning: '', resolved_by: 'arbiter-1', resolved_at: new Date().toISOString() },
    }));
    mockContractRepository.getContractById.mockResolvedValueOnce(makeContractEntity());
    // Return evidence with verified_by already set (unusual but exercises the branch)
    mockDisputeEvidenceRepository.createEvidence.mockResolvedValueOnce(makeEvidenceEntity({
      verified_by: 'arbiter-1',
      verified_at: '2025-01-15T10:00:00Z',
    }));

    const result = await submitEvidence({
      disputeId: 'dispute-1',
      submittedBy: 'freelancer-1',
      evidenceType: 'document',
      fileUrl: 'https://file.com/doc.pdf',
      description: 'Pre-verified evidence',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verifiedBy).toBe('arbiter-1');
      expect(result.data.verifiedAt).toBeDefined();
    }
  });

  it('L315-316: verifyEvidence updated entity without verified_by omits the field', async () => {
    const { verifyEvidence } = await importModule();

    mockDisputeEvidenceRepository.getEvidenceById.mockResolvedValueOnce({
      id: 'ev-1',
      dispute_id: 'dispute-1',
      submitted_by: 'freelancer-1',
      evidence_type: 'document',
      description: 'Proof',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockDisputeRepository.getDisputeById.mockResolvedValueOnce(makeDisputeEntity({
      resolution: { decision: 'freelancer_favor', reasoning: '', resolved_by: 'arbiter-1', resolved_at: new Date().toISOString() },
    }));

    // Return updated entity without verified_by/verified_at (exercises false branch)
    mockDisputeEvidenceRepository.updateEvidence.mockResolvedValueOnce({
      id: 'ev-1',
      dispute_id: 'dispute-1',
      submitted_by: 'freelancer-1',
      evidence_type: 'document',
      description: 'Proof',
      verified_by: null,
      verified_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await verifyEvidence({
      evidenceId: 'ev-1',
      verifiedBy: 'arbiter-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('verifiedBy');
      expect(result.data).not.toHaveProperty('verifiedAt');
    }
  });
});

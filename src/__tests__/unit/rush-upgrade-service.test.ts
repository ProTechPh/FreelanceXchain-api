import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import {
  createInMemoryStore,
  createMockRushUpgradeRequestRepository,
  createMockContractRepository,
  createMockProjectRepository,
  createMockUserRepository,
  createMockNotificationRepository,
} from '../helpers/mock-repository-factory.js';
import {
  createTestRushUpgradeRequest,
  createTestContract,
  createTestProject,
  createTestUser,
} from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';

const rushUpgradeStore = createInMemoryStore();
const contractStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const userStore = createInMemoryStore();
const notificationStore = createInMemoryStore();

const mockRushUpgradeRepo = createMockRushUpgradeRequestRepository(rushUpgradeStore);
const mockContractRepo = createMockContractRepository(contractStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockUserRepo = createMockUserRepository(userStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);


// Legacy pool mock: the Postgres pool was removed; kept as an inert jest.fn() so
// test-body setups that reference mockQuery stay valid.
const mockQuery = jest.fn<any>();

// Mock repositories
jest.unstable_mockModule(resolveModule('src/repositories/rush-upgrade-request-repository.ts'), () => ({
  rushUpgradeRequestRepository: mockRushUpgradeRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
}));

const paymentStore = createInMemoryStore();
const mockPaymentRepo = {
  create: jest.fn<any>(async (payment: any) => {
    const now = new Date().toISOString();
    const entity = { ...payment, id: payment.id ?? generateId(), created_at: now, updated_at: now };
    paymentStore.set(entity.id, entity);
    return entity;
  }),
  findByTxHash: jest.fn<any>(async () => null),
  clear: () => paymentStore.clear(),
};

jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  paymentRepository: mockPaymentRepo,
  PaymentType: {},
}));

// Blockchain: default to simulated mode so accepts record a simulated transfer
// instead of attempting a real on-chain send. Tests that exercise the real
// path flip these mocks per-test.
const mockGetBlockchainMode = jest.fn<any>(() => 'simulated');
const mockIsWeb3Available = jest.fn<any>(() => false);
const mockSendTransaction = jest.fn<any>();
const mockGetTransactionByHash = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainMode: mockGetBlockchainMode,
}));

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: mockIsWeb3Available,
  sendTransaction: mockSendTransaction,
  getTransactionByHash: mockGetTransactionByHash,
}));

// Mock Appwrite RPC
const mockRpc = jest.fn();

// Mock logger
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const {
  requestRushUpgrade,
  respondToRushUpgrade,
  acceptCounterOffer,
  declineCounterOffer,
  payRushUpgradeFee,
  getRushUpgradeRequestsByContract,
  getRushUpgradeRequestsForContract,
  getRushUpgradeRequestById,
} = await import('../../services/rush-upgrade-service.js');

// Seed data helpers
function seedContract(overrides: Record<string, any> = {}) {
  const contract = createTestContract({ status: 'active', ...overrides });
  contractStore.set(contract.id, contract);
  return contract;
}

function seedProject(overrides: Record<string, any> = {}) {
  const project = createTestProject(overrides);
  projectStore.set(project.id, project);
  return project;
}

function seedUser(overrides: Record<string, any> = {}) {
  const user = createTestUser(overrides);
  userStore.set(user.id, user);
  return user;
}

function seedRushUpgradeRequest(overrides: Record<string, any> = {}) {
  const request = createTestRushUpgradeRequest(overrides);
  rushUpgradeStore.set(request.id, request);
  return request;
}

  beforeEach(() => {
    rushUpgradeStore.clear();
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    paymentStore.clear();
  });

// ─── requestRushUpgrade ────────────────────────────────────────────────
describe('requestRushUpgrade', () => {
  it('should create a rush upgrade request for an active contract', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id });

    const result = await requestRushUpgrade(employer.id, {
      contractId: contract.id,
      proposedPercentage: 30,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contractId).toBe(contract.id);
    expect(result.data.proposedPercentage).toBe(30);
    expect(result.data.status).toBe('pending');
    expect(result.data.requestedBy).toBe(employer.id);
  });

  it('should reject if proposed percentage is out of range', async () => {
    const result = await requestRushUpgrade('emp1', { contractId: 'c1', proposedPercentage: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');

    const result2 = await requestRushUpgrade('emp1', { contractId: 'c1', proposedPercentage: 150 });
    expect(result2.success).toBe(false);
    if (!result2.success) expect(result2.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject if contract not found', async () => {
    const result = await requestRushUpgrade('emp1', { contractId: 'nonexistent', proposedPercentage: 25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should reject if user is not the employer', async () => {
    const contract = seedContract({ employer_id: 'real-employer', rush_fee: 0 });
    const result = await requestRushUpgrade('wrong-user', { contractId: contract.id, proposedPercentage: 25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject if contract is not active or pending', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id, status: 'completed', rush_fee: 0 });
    const result = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
  });

  it('should allow request for a pending (escrow-less) contract', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id,
      freelancer_id: freelancer.id,
      status: 'pending',
      escrow_address: '',
      rush_fee: 0,
    });
    seedProject({ id: contract.project_id });

    const result = await requestRushUpgrade(employer.id, {
      contractId: contract.id,
      proposedPercentage: 25,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe('pending');
    expect(result.data.contractId).toBe(contract.id);
  });

  it('should reject if contract already has rush fee', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id, rush_fee: 250, total_amount: 1250 });
    const result = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ALREADY_RUSH');
  });

  it('should reject if a pending request already exists', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id, rush_fee: 0 });
    seedRushUpgradeRequest({ contract_id: contract.id, status: 'pending' });
    const result = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PENDING_REQUEST_EXISTS');
  });

  it('should reject once a milestone has been approved (no retroactive re-pricing)', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id, rush_fee: 0 });
    seedProject({
      id: contract.project_id,
      milestones: [{ id: 'm1', status: 'approved' }],
    });
    const result = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
  });

  it('should allow request if existing request is declined', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id });
    seedRushUpgradeRequest({ contract_id: contract.id, status: 'declined' });
    const result = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 25 });
    expect(result.success).toBe(true);
  });

  it('should create notification for freelancer', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id });

    await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 25 });

    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].user_id).toBe(freelancer.id);
    expect(notifications[0].type).toBe('rush_upgrade_requested');
  });
});

// ─── respondToRushUpgrade ──────────────────────────────────────────────
describe('respondToRushUpgrade - accept', () => {
  it('should accept the rush upgrade and apply it via RPC', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    mockQuery.mockResolvedValueOnce({ rows: [{ result: true }], rowCount: 1 });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data as any;
    expect(data.request.status).toBe('accepted');
    expect(data.request.respondedBy).toBe(freelancer.id);
  });

  it('should use counter_percentage when accepting after counter-offer', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, counter_percentage: 20, status: 'counter_offered',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data as any;
    expect(data.request.status).toBe('accepted');
    expect(data.request.counterPercentage).toBe(20);
  });

  it('should reject if request update fails on accept', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });

  it('should reject accept once a milestone has progressed (TOCTOU re-check)', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({
      id: contract.project_id,
      milestones: [{ id: 'm1', status: 'submitted' }],
    });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
  });
});

describe('respondToRushUpgrade - decline', () => {
  it('should decline the rush upgrade request', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'decline' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data as any;
    expect(data.status).toBe('declined');
    expect(data.respondedBy).toBe(freelancer.id);
  });

  it('should create decline notification for employer', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'decline' });

    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].user_id).toBe(employer.id);
    expect(notifications[0].type).toBe('rush_upgrade_declined');
  });
});

describe('respondToRushUpgrade - counter_offer', () => {
  it('should counter-offer with a different percentage', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, {
      requestId: request.id, action: 'counter_offer', counterPercentage: 20,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data as any;
    expect(data.status).toBe('counter_offered');
    expect(data.counterPercentage).toBe(20);
    expect(data.respondedBy).toBe(freelancer.id);
  });

  it('should reject counter-offer without valid percentage', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'counter_offer' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create counter-offer notification for employer', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, status: 'pending',
    });

    await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'counter_offer', counterPercentage: 20 });

    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe('rush_upgrade_counter_offered');
  });
});

describe('respondToRushUpgrade - edge cases', () => {
  it('should reject if request not found', async () => {
    const result = await respondToRushUpgrade('f1', { requestId: 'nonexistent', action: 'accept' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should reject if user is not the contract freelancer', async () => {
    const contract = seedContract({ freelancer_id: 'real-freelancer' });
    const request = seedRushUpgradeRequest({ contract_id: contract.id, status: 'pending' });
    const result = await respondToRushUpgrade('wrong-user', { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject if request status is already accepted', async () => {
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({ contract_id: contract.id, status: 'accepted' });
    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
  });
});

// ─── acceptCounterOffer ────────────────────────────────────────────────
describe('acceptCounterOffer', () => {
  it('should accept the counter-offer and apply rush upgrade', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, counter_percentage: 20, status: 'counter_offered',
    });

    mockContractRepo.updateContract.mockResolvedValueOnce({ id: contract.id, rush_fee: 200, total_amount: 1200 });

    const result = await acceptCounterOffer(employer.id, request.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.request.status).toBe('accepted');
    // total_amount intentionally stays at base — the fee is paid directly.
    expect(mockContractRepo.updateContract).toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ rush_fee: 200 }),
    );
    expect(mockContractRepo.updateContract).not.toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ total_amount: 1200 }),
    );
  });

  it('should reject if not the employer', async () => {
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: 'real-employer', freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({ contract_id: contract.id, status: 'counter_offered', counter_percentage: 20 });
    const result = await acceptCounterOffer(freelancer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject if request is not in counter_offered status', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id });
    const request = seedRushUpgradeRequest({ contract_id: contract.id, status: 'pending', counter_percentage: 20 });
    const result = await acceptCounterOffer(employer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
  });

  it('should reject if no counter percentage exists', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id });
    const request = seedRushUpgradeRequest({ contract_id: contract.id, status: 'counter_offered', counter_percentage: null });
    const result = await acceptCounterOffer(employer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NO_COUNTER');
  });

  it('should create notification for freelancer on acceptance', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, counter_percentage: 20, status: 'counter_offered',
    });

    await acceptCounterOffer(employer.id, request.id);

    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].user_id).toBe(freelancer.id);
    expect(notifications[0].type).toBe('rush_upgrade_accepted');
  });

  it('should reject acceptCounterOffer once a milestone has been refunded', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({
      id: contract.project_id,
      milestones: [{ id: 'm1', status: 'refunded' }],
    });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, counter_percentage: 20, status: 'counter_offered',
    });

    const result = await acceptCounterOffer(employer.id, request.id);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
  });
});

// ─── declineCounterOffer ────────────────────────────────────────────────
describe('declineCounterOffer', () => {
  it('should decline the counter-offer', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, counter_percentage: 20, status: 'counter_offered',
    });

    const result = await declineCounterOffer(employer.id, request.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe('declined');
  });

  it('should reject if not the employer', async () => {
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: 'real-employer', freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({ contract_id: contract.id, status: 'counter_offered' });
    const result = await declineCounterOffer(freelancer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject if request is not counter_offered', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id });
    const request = seedRushUpgradeRequest({ contract_id: contract.id, status: 'pending' });
    const result = await declineCounterOffer(employer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
  });

  it('should create notification for freelancer on decline', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, counter_percentage: 20, status: 'counter_offered',
    });

    await declineCounterOffer(employer.id, request.id);

    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].user_id).toBe(freelancer.id);
    expect(notifications[0].type).toBe('rush_upgrade_declined');
  });
});

// ─── getRushUpgradeRequestsByContract ───────────────────────────────────
describe('getRushUpgradeRequestsByContract', () => {
  it('should return all requests for a contract', async () => {
    const contractId = 'contract-1';
    seedRushUpgradeRequest({ contract_id: contractId, status: 'declined' });
    seedRushUpgradeRequest({ contract_id: contractId, status: 'pending' });
    seedRushUpgradeRequest({ contract_id: 'other-contract', status: 'pending' });

    const result = await getRushUpgradeRequestsByContract(contractId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(2);
  });

  it('should return empty array if no requests', async () => {
    const result = await getRushUpgradeRequestsByContract('no-requests');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(0);
  });
});

// ─── getRushUpgradeRequestsForContract ─────────────────────────────────
describe('getRushUpgradeRequestsForContract', () => {
  it('should return requests for a contract party', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    seedRushUpgradeRequest({ contract_id: contract.id, status: 'pending' });

    const result = await getRushUpgradeRequestsForContract(contract.id, freelancer.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.status).toBe('pending');
    }
  });

  it('should return requests when the employer is the caller', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    seedRushUpgradeRequest({ contract_id: contract.id, status: 'pending' });

    const result = await getRushUpgradeRequestsForContract(contract.id, employer.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });

  it('should allow admins to view requests for any contract', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id });
    seedRushUpgradeRequest({ contract_id: contract.id, status: 'declined' });

    const result = await getRushUpgradeRequestsForContract(contract.id, 'admin-1', true);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });

  it('should return NOT_FOUND when the contract does not exist', async () => {
    const result = await getRushUpgradeRequestsForContract('nonexistent', 'user-1');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return UNAUTHORIZED when the user is not a party', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id });
    seedRushUpgradeRequest({ contract_id: contract.id, status: 'pending' });

    const result = await getRushUpgradeRequestsForContract(contract.id, 'outsider-1');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
  });
});

// ─── getRushUpgradeRequestById ─────────────────────────────────────────
describe('getRushUpgradeRequestById', () => {
  it('should return the request by id', async () => {
    const request = seedRushUpgradeRequest({ proposed_percentage: 35 });
    const result = await getRushUpgradeRequestById(request.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.proposedPercentage).toBe(35);
  });

  it('should return NOT_FOUND for nonexistent id', async () => {
    const result = await getRushUpgradeRequestById('nonexistent');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── Full negotiation flow ─────────────────────────────────────────────
describe('Full rush upgrade negotiation flow', () => {
  it('should complete employer-request → freelancer-counter → employer-accept', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });

    const reqResult = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 30 });
    expect(reqResult.success).toBe(true);
    if (!reqResult.success) return;
    const requestId = reqResult.data.id;

    const counterResult = await respondToRushUpgrade(freelancer.id, { requestId, action: 'counter_offer', counterPercentage: 20 });
    expect(counterResult.success).toBe(true);
    if (!counterResult.success) return;
    expect((counterResult.data as any).status).toBe('counter_offered');
    expect((counterResult.data as any).counterPercentage).toBe(20);

    mockContractRepo.updateContract.mockResolvedValueOnce({ id: contract.id, rush_fee: 200, total_amount: 1200 });
    const acceptResult = await acceptCounterOffer(employer.id, requestId);
    expect(acceptResult.success).toBe(true);
    if (!acceptResult.success) return;
    expect(acceptResult.data.request.status).toBe('accepted');
    // total_amount intentionally stays at base — the fee is paid directly.
    expect(mockContractRepo.updateContract).toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ rush_fee: 200 }),
    );
    expect(mockContractRepo.updateContract).not.toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ total_amount: 1200 }),
    );
  });

  it('should complete employer-request → freelancer-decline', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id });

    const reqResult = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 30 });
    expect(reqResult.success).toBe(true);
    if (!reqResult.success) return;

    const declineResult = await respondToRushUpgrade(freelancer.id, { requestId: reqResult.data.id, action: 'decline' });
    expect(declineResult.success).toBe(true);
    if (!declineResult.success) return;
    expect((declineResult.data as any).status).toBe('declined');
  });

  it('should complete employer-request → freelancer-counter → employer-decline', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id });

    const reqResult = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 30 });
    expect(reqResult.success).toBe(true);
    if (!reqResult.success) return;

    await respondToRushUpgrade(freelancer.id, { requestId: reqResult.data.id, action: 'counter_offer', counterPercentage: 50 });

    const declineResult = await declineCounterOffer(employer.id, reqResult.data.id);
    expect(declineResult.success).toBe(true);
    if (!declineResult.success) return;
    expect(declineResult.data.status).toBe('declined');
  });
});

// ─── Additional coverage tests ─────────────────────────────────────
describe('rush-upgrade-service - additional coverage', () => {
  it('should return UPDATE_FAILED when accept update returns null', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });

  it('should return UPDATE_FAILED when decline update returns null', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'decline' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });

  it('should return UPDATE_FAILED when counter_offer update returns null', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, status: 'pending',
    });

    mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

    const result = await respondToRushUpgrade(freelancer.id, {
      requestId: request.id, action: 'counter_offer', counterPercentage: 20,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });

  it('should gracefully handle notification failure in sendNotificationSafe', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id });

    mockNotificationRepo.createNotification.mockRejectedValueOnce(new Error('Notification service down'));

    const result = await requestRushUpgrade(employer.id, {
      contractId: contract.id, proposedPercentage: 25,
    });
    expect(result.success).toBe(true);
  });

  it('should return NOT_FOUND when acceptCounterOffer request not found', async () => {
    const result = await acceptCounterOffer('employer-1', 'nonexistent');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return UPDATE_FAILED when acceptCounterOffer update returns null', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, counter_percentage: 20, status: 'counter_offered',
    });

    mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

    const result = await acceptCounterOffer(employer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });

  it('should return UPDATE_FAILED when acceptCounterOffer contract update fails', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, counter_percentage: 20, status: 'counter_offered',
    });

    mockContractRepo.updateContract.mockResolvedValueOnce(null);

    const result = await acceptCounterOffer(employer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });

  it('should return NOT_FOUND when declineCounterOffer request not found', async () => {
    const result = await declineCounterOffer('employer-1', 'nonexistent');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return UPDATE_FAILED when declineCounterOffer update returns null', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, counter_percentage: 20, status: 'counter_offered',
    });

    mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

    const result = await declineCounterOffer(employer.id, request.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });
});

// ═══════════════════════════════════════════════════════════════
// Coverage gap tests — each test targets a specific uncovered line
// ═══════════════════════════════════════════════════════════════

describe('rush-upgrade-service - Coverage Gaps', () => {
  beforeEach(() => {
    rushUpgradeStore.clear();
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    jest.clearAllMocks();
  });

  describe('sendNotificationSafe catch (L44)', () => {
    it('L44: should catch and log notification failure', async () => {
      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer' });
      const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
      seedProject({ id: contract.project_id });

      mockNotificationRepo.createNotification.mockRejectedValueOnce(new Error('Notification service down'));

      const result = await requestRushUpgrade(employer.id, {
        contractId: contract.id, proposedPercentage: 25,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('respondToRushUpgrade update failures (L183, L239, L276)', () => {
    it('L183: should return UPDATE_FAILED when accept update returns null', async () => {
      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer' });
      const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
      seedProject({ id: contract.project_id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
      });

      mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

      const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('L239: should return UPDATE_FAILED when decline update returns null', async () => {
      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer' });
      const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
      });

      mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

      const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'decline' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('L276: should return UPDATE_FAILED when counter_offer update returns null', async () => {
      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer' });
      const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, status: 'pending',
      });

      mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

      const result = await respondToRushUpgrade(freelancer.id, {
        requestId: request.id, action: 'counter_offer', counterPercentage: 20,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('respondToRushUpgrade invalid action (L298)', () => {
    it('L298: should return INVALID_ACTION for unknown action', async () => {
      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer' });
      const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
      });

      const result = await respondToRushUpgrade(freelancer.id, {
        requestId: request.id, action: 'invalid_action' as any,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_ACTION');
    });
  });

  describe('acceptCounterOffer (L311, L348, L364-365)', () => {
    it('L311: should return NOT_FOUND when request not found', async () => {
      const result = await acceptCounterOffer('employer-1', 'nonexistent');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L348: should return UPDATE_FAILED when update returns null', async () => {
      const employer = seedUser({ role: 'employer' });
      const contract = seedContract({ employer_id: employer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
      seedProject({ id: contract.project_id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, counter_percentage: 20, status: 'counter_offered',
      });

      mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

      const result = await acceptCounterOffer(employer.id, request.id);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('L364-365: should return UPDATE_FAILED when contract update fails', async () => {
      const employer = seedUser({ role: 'employer' });
      const contract = seedContract({ employer_id: employer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
      seedProject({ id: contract.project_id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, counter_percentage: 20, status: 'counter_offered',
      });

      mockContractRepo.updateContract.mockResolvedValueOnce(null);

      const result = await acceptCounterOffer(employer.id, request.id);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('declineCounterOffer (L401, L430)', () => {
    it('L401: should return NOT_FOUND when request not found', async () => {
      const result = await declineCounterOffer('employer-1', 'nonexistent');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L430: should return UPDATE_FAILED when update returns null', async () => {
      const employer = seedUser({ role: 'employer' });
      const contract = seedContract({ employer_id: employer.id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, counter_percentage: 20, status: 'counter_offered',
      });

      mockRushUpgradeRepo.updateRequest.mockResolvedValueOnce(null);

      const result = await declineCounterOffer(employer.id, request.id);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });
});

describe('Rush Upgrade Service - Additional Branch Coverage', () => {
  beforeEach(() => {
    rushUpgradeStore.clear();
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    jest.clearAllMocks();
  });

  // Line 40: sendNotificationSafe data ?? {} — covered when requestRushUpgrade sends notification with data
  it('L40: sendNotificationSafe executes data assignment when notification succeeds', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id });

    const result = await requestRushUpgrade(employer.id, {
      contractId: contract.id, proposedPercentage: 25,
    });
    expect(result.success).toBe(true);
    // The notification was sent with data defined, covering line 40 left branch
    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
  });

  // Line 129: projectEntity?.title ?? 'your contract' when project doesn't exist
  it('L129: requestRushUpgrade uses fallback title when project not found', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    // Do NOT seed project for contract.project_id → findProjectById returns null

    const result = await requestRushUpgrade(employer.id, {
      contractId: contract.id, proposedPercentage: 25,
    });
    expect(result.success).toBe(true);
    // Notification should use 'your contract' fallback
    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].message).toContain('your contract');
  });

  // Line 129: projectEntity?.title when project exists
  it('L129: requestRushUpgrade uses project title when project found', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, rush_fee: 0 });
    seedProject({ id: contract.project_id, title: 'My Web3 Project' });

    const result = await requestRushUpgrade(employer.id, {
      contractId: contract.id, proposedPercentage: 25,
    });
    expect(result.success).toBe(true);
    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].message).toContain('My Web3 Project');
  });

  // Line 216: projectEntity?.title ?? 'your contract' in accept notification when project not found
  it('L216: respondToRushUpgrade accept uses fallback title when project not found', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    // Do NOT seed project
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(true);
    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].message).toContain('your contract');
  });

  // Line 216: projectEntity?.title in accept notification when project exists
  it('L216: respondToRushUpgrade accept uses project title when project found', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id, title: 'DeFi Dashboard' });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(true);
    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].message).toContain('DeFi Dashboard');
  });
});

describe('rush-upgrade-service - accept leaves milestones at base amounts', () => {
  beforeEach(() => {
    rushUpgradeStore.clear();
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    paymentStore.clear();
    jest.clearAllMocks();
    mockGetBlockchainMode.mockReturnValue('simulated');
    mockIsWeb3Available.mockReturnValue(false);
  });

  it('does not rescale project milestones when accepting (fee is paid directly)', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({
      id: contract.project_id,
      milestones: [
        { id: 'm1', amount: 500, status: 'pending' },
        { id: 'm2', amount: 500, status: 'pending' },
      ],
    });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(true);

    // The escrow was deployed and funded with base amounts; milestones must not
    // move or the DB read model would diverge from the ledger.
    const updatedProject = projectStore.get(contract.project_id) as any;
    expect(updatedProject).toBeDefined();
    expect(updatedProject.milestones).toHaveLength(2);
    expect(updatedProject.milestones[0].amount).toBe(500);
    expect(updatedProject.milestones[1].amount).toBe(500);
    expect(mockProjectRepo.updateProject).not.toHaveBeenCalled();
  });

  it('should handle single milestone project on accept', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({
      id: contract.project_id,
      milestones: [
        { id: 'm1', amount: 1000, status: 'pending' },
      ],
    });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(true);

    const updatedProject = projectStore.get(contract.project_id) as any;
    expect(updatedProject.milestones[0].amount).toBe(1000);
  });

  it('should handle milestone with null amount on accept', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({
      id: contract.project_id,
      milestones: [
        { id: 'm1', amount: null as any, status: 'pending' },
        { id: 'm2', amount: 500, status: 'pending' },
      ],
    });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(true);
  });
});

// ─── Direct rush fee transfer (option B) ────────────────────────────────
describe('rush upgrade - direct fee transfer', () => {
  beforeEach(() => {
    rushUpgradeStore.clear();
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    paymentStore.clear();
    jest.clearAllMocks();
    mockGetBlockchainMode.mockReturnValue('simulated');
    mockIsWeb3Available.mockReturnValue(false);
  });

  it('pays the rush fee as a direct transfer and records a payment on accept', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
    });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'accepted',
    });

    const result = await payRushUpgradeFee(employer.id, { requestId: request.id });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Simulated counterpart: a durable payment record with a sim hash.
    const payments = Array.from(paymentStore.values()) as any[];
    expect(payments).toHaveLength(1);
    expect(payments[0].payment_type).toBe('rush_fee');
    expect(payments[0].payer_id).toBe(employer.id);
    expect(payments[0].payee_id).toBe(freelancer.id);
    expect(payments[0].amount).toBe(250);
    expect(payments[0].tx_hash).toMatch(/^sim-rush-fee-/);
    expect(payments[0].status).toBe('completed');

    // Fee recorded on the contract; total_amount stays at base.
    expect(mockContractRepo.updateContract).toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ rush_fee: 250 }),
    );
    expect(mockContractRepo.updateContract).not.toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ total_amount: expect.anything() }),
    );
    // Milestones are NOT rescaled — the escrow keeps paying base amounts.
    expect(mockProjectRepo.updateProject).not.toHaveBeenCalled();
  });

  it('requires a client transaction hash when blockchain mode is real', async () => {
    mockGetBlockchainMode.mockReturnValue('real');
    mockIsWeb3Available.mockReturnValue(true);

    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
    });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 20, status: 'accepted',
    });

    const result = await payRushUpgradeFee(employer.id, { requestId: request.id });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSACTION_HASH_REQUIRED');
    }
    mockGetBlockchainMode.mockReturnValue('simulated');
  });

  it('rejects pay when the on-chain transfer verification fails', async () => {
    mockGetBlockchainMode.mockReturnValue('real');
    mockIsWeb3Available.mockReturnValue(true);
    const validHash = '0x' + 'a'.repeat(64);
    mockGetTransactionByHash.mockRejectedValue(new Error('insufficient funds'));

    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
    });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'accepted',
    });

    const result = await payRushUpgradeFee(employer.id, { requestId: request.id, transactionHash: validHash });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VERIFICATION_FAILED');
    // Nothing applied: contract untouched
    expect(mockContractRepo.updateContract).not.toHaveBeenCalled();
    expect(Array.from(paymentStore.values())).toHaveLength(0);
    mockGetBlockchainMode.mockReturnValue('simulated');
  });

  it('rejects pay when the freelancer has no wallet in real mode', async () => {
    mockGetBlockchainMode.mockReturnValue('real');
    mockIsWeb3Available.mockReturnValue(true);
    const validHash = '0x' + 'c'.repeat(64);

    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer', wallet_address: null });
    const contract = seedContract({
      employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
    });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'accepted',
    });

    const result = await payRushUpgradeFee(employer.id, { requestId: request.id, transactionHash: validHash });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('MISSING_WALLET');
    expect(mockContractRepo.updateContract).not.toHaveBeenCalled();
    mockGetBlockchainMode.mockReturnValue('simulated');
  });

  it('pays the rush fee directly when accepting a counter-offer', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
    });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, counter_percentage: 20, status: 'counter_offered',
    });

    const result = await acceptCounterOffer(employer.id, request.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const payments = Array.from(paymentStore.values()) as any[];
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(200); // 20% of 1000
    expect(mockContractRepo.updateContract).toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ rush_fee: 200 }),
    );
    expect(mockContractRepo.updateContract).not.toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ total_amount: expect.anything() }),
    );
  });

  it('rejects pay when the payment record cannot be saved', async () => {
    mockPaymentRepo.create.mockRejectedValueOnce(new Error('db down'));

    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
    });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'accepted',
    });

    const result = await payRushUpgradeFee(employer.id, { requestId: request.id });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PAYMENT_RECORD_FAILED');
    // The fee was transferred but the record failed — nothing applied to the contract.
    expect(mockContractRepo.updateContract).not.toHaveBeenCalled();
  });

  it('rejects pay when the computed rush fee is not positive', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 0, rush_fee: 0, total_amount: 0,
    });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'accepted',
    });

    const result = await payRushUpgradeFee(employer.id, { requestId: request.id });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(mockContractRepo.updateContract).not.toHaveBeenCalled();
  });
});

// ─── Fee folds into escrow for escrow-less (pending) contracts ──────────
describe('rush upgrade - fee folds into escrow at deploy', () => {
  beforeEach(() => {
    rushUpgradeStore.clear();
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    paymentStore.clear();
    jest.clearAllMocks();
    mockGetBlockchainMode.mockReturnValue('simulated');
    mockIsWeb3Available.mockReturnValue(false);
  });

  function seedPendingContract(baseAmount: number, escrowAddress = '') {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({
      employer_id: employer.id,
      freelancer_id: freelancer.id,
      status: 'pending',
      escrow_address: escrowAddress,
      base_amount: baseAmount,
      rush_fee: 0,
      total_amount: baseAmount,
    });
    seedProject({ id: contract.project_id });
    return { employer, freelancer, contract };
  }

  it('accept on an escrow-less contract bumps total_amount and does not transfer', async () => {
    const { employer, freelancer, contract } = seedPendingContract(1000);
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Fee folds into the escrow: total bumped to base + fee, no direct transfer.
    expect(mockContractRepo.updateContract).toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ rush_fee: 250, total_amount: 1250 }),
    );
    expect(mockSendTransaction).not.toHaveBeenCalled();
    expect(Array.from(paymentStore.values())).toHaveLength(0);
    // Request accepted, contract records the fee.
    const data = result.data as any;
    expect(data.contract.rushFee).toBe(250);
    expect(data.contract.totalAmount).toBe(1250);
  });

  it('acceptCounterOffer on an escrow-less contract folds the fee into the escrow', async () => {
    const { employer, freelancer, contract } = seedPendingContract(1000);
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 30, counter_percentage: 20, status: 'counter_offered',
    });

    const result = await acceptCounterOffer(employer.id, request.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(mockContractRepo.updateContract).toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ rush_fee: 200, total_amount: 1200 }),
    );
    expect(mockSendTransaction).not.toHaveBeenCalled();
    expect(Array.from(paymentStore.values())).toHaveLength(0);
  });

  it('uses the direct-transfer path when a pending contract unexpectedly has an escrow', async () => {
    const { employer, freelancer, contract } = seedPendingContract(1000, '0x' + 'd'.repeat(40));
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect((result.data as any).request.status).toBe('accepted');

    const payResult = await payRushUpgradeFee(employer.id, { requestId: request.id });
    expect(payResult.success).toBe(true);
    if (!payResult.success) return;

    expect(mockContractRepo.updateContract).toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ rush_fee: 250 }),
    );
    expect(mockContractRepo.updateContract).not.toHaveBeenCalledWith(
      contract.id,
      expect.objectContaining({ total_amount: expect.anything() }),
    );
    expect(Array.from(paymentStore.values())).toHaveLength(1);
  });

  describe('rush upgrade - clientTxHash verification', () => {
    it('rejects clientTxHash with invalid hex format', async () => {
      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer' });
      const contract = seedContract({
        employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
      });
      seedProject({ id: contract.project_id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 20, status: 'accepted',
      });

      const result = await payRushUpgradeFee(employer.id, {
        requestId: request.id,
        transactionHash: 'not-a-valid-hex-hash',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_TRANSACTION_HASH');
    });

    it('rejects clientTxHash if duplicate transaction already registered', async () => {
      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer' });
      const contract = seedContract({
        employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
      });
      seedProject({ id: contract.project_id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 20, status: 'accepted',
      });

      const validHash = '0x' + 'a'.repeat(64);
      mockPaymentRepo.findByTxHash.mockResolvedValueOnce({ id: 'existing-payment' });

      const result = await payRushUpgradeFee(employer.id, {
        requestId: request.id,
        transactionHash: validHash,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('DUPLICATE_TRANSACTION');
    });

    it('verifies clientTxHash on-chain when blockchain mode is real', async () => {
      mockGetBlockchainMode.mockReturnValue('real');
      mockIsWeb3Available.mockReturnValue(true);

      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer', wallet_address: '0x' + '2'.repeat(40) });
      const contract = seedContract({
        employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
      });
      seedProject({ id: contract.project_id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 20, status: 'accepted',
      });

      const validHash = '0x' + 'b'.repeat(64);
      mockGetTransactionByHash.mockResolvedValueOnce({
        hash: validHash,
        status: 'success',
        to: freelancer.wallet_address,
        value: BigInt('200000000000000000000'), // 200 ETH in wei (1000 * 20%)
      });

      const result = await payRushUpgradeFee(employer.id, {
        requestId: request.id,
        transactionHash: validHash,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.contract.rushFee).toBe(200);
      mockGetBlockchainMode.mockReturnValue('simulated');
      mockIsWeb3Available.mockReturnValue(false);
    });

    it('rejects clientTxHash if on-chain recipient does not match freelancer', async () => {
      mockGetBlockchainMode.mockReturnValue('real');
      mockIsWeb3Available.mockReturnValue(true);

      const employer = seedUser({ role: 'employer' });
      const freelancer = seedUser({ role: 'freelancer', wallet_address: '0x' + '2'.repeat(40) });
      const contract = seedContract({
        employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000,
      });
      seedProject({ id: contract.project_id });
      const request = seedRushUpgradeRequest({
        contract_id: contract.id, requested_by: employer.id, proposed_percentage: 20, status: 'accepted',
      });

      const validHash = '0x' + 'c'.repeat(64);
      mockGetTransactionByHash.mockResolvedValueOnce({
        hash: validHash,
        status: 'success',
        to: '0x' + '9'.repeat(40), // Wrong recipient!
        value: BigInt('200000000000000000000'),
      });

      const result = await payRushUpgradeFee(employer.id, {
        requestId: request.id,
        transactionHash: validHash,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_RECIPIENT');
      mockGetBlockchainMode.mockReturnValue('simulated');
      mockIsWeb3Available.mockReturnValue(false);
    });
  });
});

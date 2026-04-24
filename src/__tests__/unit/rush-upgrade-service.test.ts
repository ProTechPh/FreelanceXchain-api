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

// Create stores and mocks
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

// Mock Supabase RPC
const mockRpc = jest.fn();
jest.unstable_mockModule(resolveModule('src/config/supabase.ts'), () => ({
  getSupabaseServiceClient: jest.fn(() => ({ rpc: mockRpc })),
}));

// Mock logger
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Import after mocking
const {
  requestRushUpgrade,
  respondToRushUpgrade,
  acceptCounterOffer,
  declineCounterOffer,
  getRushUpgradeRequestsByContract,
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
  mockRpc.mockReset();
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

  it('should reject if contract is not active', async () => {
    const employer = seedUser({ role: 'employer' });
    const contract = seedContract({ employer_id: employer.id, status: 'pending', rush_fee: 0 });
    const result = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
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

    (mockRpc as any).mockResolvedValue({ data: { success: true }, error: null });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data as any;
    expect(data.request.status).toBe('accepted');
    expect(data.request.respondedBy).toBe(freelancer.id);
    expect(mockRpc).toHaveBeenCalledWith('apply_rush_upgrade_atomic', {
      p_contract_id: contract.id, p_rush_fee_percentage: 25,
    });
  });

  it('should use counter_percentage when accepting after counter-offer', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, counter_percentage: 20, status: 'counter_offered',
    });

    (mockRpc as any).mockResolvedValue({ data: { success: true }, error: null });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });

    expect(result.success).toBe(true);
    expect((mockRpc as any)).toHaveBeenCalledWith('apply_rush_upgrade_atomic', {
      p_contract_id: contract.id, p_rush_fee_percentage: 20,
    });
  });

  it('should reject if RPC fails', async () => {
    const employer = seedUser({ role: 'employer' });
    const freelancer = seedUser({ role: 'freelancer' });
    const contract = seedContract({ employer_id: employer.id, freelancer_id: freelancer.id, base_amount: 1000, rush_fee: 0, total_amount: 1000 });
    seedProject({ id: contract.project_id });
    const request = seedRushUpgradeRequest({
      contract_id: contract.id, requested_by: employer.id, proposed_percentage: 25, status: 'pending',
    });

    (mockRpc as any).mockResolvedValue({ data: null, error: new Error('RPC failed') });

    const result = await respondToRushUpgrade(freelancer.id, { requestId: request.id, action: 'accept' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
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
    expect((mockRpc as any)).not.toHaveBeenCalled();
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

    (mockRpc as any).mockResolvedValue({ data: { success: true }, error: null });

    const result = await acceptCounterOffer(employer.id, request.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.request.status).toBe('accepted');
    expect((mockRpc as any)).toHaveBeenCalledWith('apply_rush_upgrade_atomic', {
      p_contract_id: contract.id, p_rush_fee_percentage: 20,
    });
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

    (mockRpc as any).mockResolvedValue({ data: { success: true }, error: null });
    await acceptCounterOffer(employer.id, request.id);

    const notifications = Array.from(notificationStore.values()) as any[];
    expect(notifications.length).toBe(1);
    expect(notifications[0].user_id).toBe(freelancer.id);
    expect(notifications[0].type).toBe('rush_upgrade_accepted');
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
    expect(mockRpc).not.toHaveBeenCalled();
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

    // 1. Employer requests rush upgrade
    const reqResult = await requestRushUpgrade(employer.id, { contractId: contract.id, proposedPercentage: 30 });
    expect(reqResult.success).toBe(true);
    if (!reqResult.success) return;
    const requestId = reqResult.data.id;

    // 2. Freelancer counter-offers
    const counterResult = await respondToRushUpgrade(freelancer.id, { requestId, action: 'counter_offer', counterPercentage: 20 });
    expect(counterResult.success).toBe(true);
    if (!counterResult.success) return;
    expect((counterResult.data as any).status).toBe('counter_offered');
    expect((counterResult.data as any).counterPercentage).toBe(20);

    // 3. Employer accepts counter-offer
    (mockRpc as any).mockResolvedValue({ data: { success: true }, error: null });
    const acceptResult = await acceptCounterOffer(employer.id, requestId);
    expect(acceptResult.success).toBe(true);
    if (!acceptResult.success) return;
    expect(acceptResult.data.request.status).toBe('accepted');
    expect((mockRpc as any)).toHaveBeenCalledWith('apply_rush_upgrade_atomic', {
      p_contract_id: contract.id, p_rush_fee_percentage: 20,
    });
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
    expect((mockRpc as any)).not.toHaveBeenCalled();
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
    expect((mockRpc as any)).not.toHaveBeenCalled();
  });
});

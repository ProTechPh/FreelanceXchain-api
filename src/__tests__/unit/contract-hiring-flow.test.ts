// @ts-nocheck
/**
 * Hiring flow: accept → negotiate (offers/counters, floor) → dual e-signature
 * (freelancer first, EIP-712 verified with real wallets) → awaiting_funding →
 * activation / funding-deadline expiry. Services run for real against
 * in-memory repositories.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { Wallet } from 'ethers';
import {
  createInMemoryStore,
  createMockContractRepository,
  createMockProjectRepository,
  createMockProposalRepository,
  createMockUserRepository,
  createMockNotificationRepository,
} from '../helpers/mock-repository-factory.js';
import { createTestContract, createTestProject, createTestProposal, createTestUser, createTestMilestone } from '../helpers/test-data-factory.js';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const contractStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const proposalStore = createInMemoryStore();
const userStore = createInMemoryStore();
const notificationStore = createInMemoryStore();
const offerStore = new Map<string, any>();
const signatureStore = new Map<string, any>();

const mockContractRepo = createMockContractRepository(contractStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockProposalRepo = createMockProposalRepository(proposalStore);
const mockUserRepo = createMockUserRepository(userStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

let seq = 0;
const stamp = () => new Date(Date.now() + seq++).toISOString();

const mockOfferRepo = {
  createOffer: jest.fn(async (offer: any) => {
    const created = { ...offer, created_at: stamp(), updated_at: stamp() };
    offerStore.set(offer.id, created);
    return created;
  }),
  getOfferById: jest.fn(async (id: string) => offerStore.get(id) ?? null),
  updateOffer: jest.fn(async (id: string, updates: any) => {
    const current = offerStore.get(id);
    if (!current) return null;
    const updated = { ...current, ...updates, updated_at: stamp() };
    offerStore.set(id, updated);
    return updated;
  }),
  listByContract: jest.fn(async (contractId: string) =>
    [...offerStore.values()].filter(o => o.contract_id === contractId).sort((a, b) => a.created_at.localeCompare(b.created_at))),
};

const mockSignatureRepo = {
  createSignature: jest.fn(async (sig: any) => {
    const created = { ...sig, created_at: stamp(), updated_at: stamp() };
    signatureStore.set(sig.id, created);
    return created;
  }),
  listByContract: jest.fn(async (contractId: string) =>
    [...signatureStore.values()].filter(s => s.contract_id === contractId)),
  voidAllForContract: jest.fn(async (contractId: string) => {
    let n = 0;
    for (const [id, s] of signatureStore) {
      if (s.contract_id === contractId && s.status === 'valid') { signatureStore.set(id, { ...s, status: 'voided' }); n++; }
    }
    return n;
  }),
};

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
  SLOT_HOLDING_STATUSES: [],
  FUNDED_STATUSES: [],
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({ projectRepository: mockProjectRepo }));
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({ proposalRepository: mockProposalRepo }));
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({ userRepository: mockUserRepo }));
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({ notificationRepository: mockNotificationRepo }));
jest.unstable_mockModule(resolveModule('src/repositories/contract-offer-repository.ts'), () => ({ contractOfferRepository: mockOfferRepo }));
jest.unstable_mockModule(resolveModule('src/repositories/contract-signature-repository.ts'), () => ({ contractSignatureRepository: mockSignatureRepo }));

const mockAuditCreate = jest.fn<any>().mockResolvedValue(undefined);
jest.unstable_mockModule(resolveModule('src/repositories/audit-log-repository.ts'), () => ({ auditLogRepository: { create: mockAuditCreate } }));

const mockSendGatedEmail = jest.fn<any>(async (_u: string, _t: string, send: any) => { await send({ email: 'x@example.com', name: 'X' }); return true; });
const mockSendContractActionEmail = jest.fn<any>().mockResolvedValue({ success: true, data: { messageId: 'm' } });
jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendGatedEmail: mockSendGatedEmail,
  sendContractActionEmail: mockSendContractActionEmail,
}));

const mockLockAgreementTerms = jest.fn<any>().mockResolvedValue(undefined);
const mockCancelAgreement = jest.fn<any>().mockResolvedValue(undefined);
const mockSignAgreement = jest.fn<any>().mockResolvedValue(undefined);
jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  lockAgreementTerms: mockLockAgreementTerms,
  cancelAgreement: mockCancelAgreement,
  signAgreement: mockSignAgreement,
}));

const mockGetBlockchainMode = jest.fn<any>(() => 'simulated');
jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({ getBlockchainMode: mockGetBlockchainMode }));

const mockIsWeb3Available = jest.fn<any>(() => false);
const mockGetNetwork = jest.fn<any>().mockResolvedValue({ chainId: 31337n });
jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: mockIsWeb3Available,
  getProvider: () => ({ getNetwork: mockGetNetwork }),
}));

const mockFindExistingDeployment = jest.fn<any>().mockResolvedValue(null);
jest.unstable_mockModule(resolveModule('src/services/escrow-bytecode-validator.ts'), () => ({
  findExistingOnChainEscrowDeployment: mockFindExistingDeployment,
}));

const negotiation = await import('../../services/contract-negotiation-service.js');
const signatures = await import('../../services/contract-signature-service.js');
const lifecycle = await import('../../services/contract-lifecycle-service.js');
const stateMachine = await import('../../services/contract-state-machine.js');
const store = await import('../../services/contract-milestone-store.js');

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

type Fixture = {
  employer: any; freelancer: any; employerWallet: Wallet; freelancerWallet: Wallet;
  project: any; proposal: any; contract: any;
};

function setup(overrides: { status?: string; floor?: number; projectMilestones?: any[]; freelancerLimit?: number } = {}): Fixture {
  const employerWallet = Wallet.createRandom();
  const freelancerWallet = Wallet.createRandom();
  const employer = createTestUser({ id: `emp-${seq++}`, role: 'employer', wallet_address: employerWallet.address });
  const freelancer = createTestUser({ id: `fl-${seq++}`, role: 'freelancer', wallet_address: freelancerWallet.address.toLowerCase() });
  userStore.set(employer.id, employer);
  userStore.set(freelancer.id, freelancer);
  const project = createTestProject({
    id: `proj-${seq++}`,
    employer_id: employer.id,
    title: 'Escrow dApp',
    deadline: day(60),
    freelancer_limit: overrides.freelancerLimit ?? 1,
    milestones: overrides.projectMilestones ?? [
      createTestMilestone({ id: 'tm1', title: 'Design', amount: 1, due_date: day(20) }),
      createTestMilestone({ id: 'tm2', title: 'Build', amount: 1, due_date: day(40) }),
    ],
  });
  projectStore.set(project.id, project);
  const proposal = createTestProposal({ id: `prop-${seq++}`, project_id: project.id, freelancer_id: freelancer.id, proposed_rate: overrides.floor ?? 2, status: 'accepted' });
  proposalStore.set(proposal.id, proposal);
  const contract = createTestContract({
    id: `con-${seq++}`,
    project_id: project.id,
    proposal_id: proposal.id,
    employer_id: employer.id,
    freelancer_id: freelancer.id,
    escrow_address: '',
    base_amount: proposal.proposed_rate,
    total_amount: proposal.proposed_rate,
    status: overrides.status ?? 'negotiating',
    milestone_source: 'contract',
  });
  contractStore.set(contract.id, contract);
  return { employer, freelancer, employerWallet, freelancerWallet, project, proposal, contract };
}

function offerInput(overrides: Record<string, unknown> = {}) {
  return {
    baseAmount: 2,
    additionalPay: 0.5,
    isRush: false,
    deadline: day(50),
    milestones: [
      { title: 'Design', description: 'Mockups', amount: 1, dueDate: day(20) },
      { title: 'Build', amount: 1.5, dueDate: day(45) },
    ],
    ...overrides,
  };
}

async function lockTerms(f: Fixture) {
  const offer = await negotiation.createOffer(f.contract.id, f.freelancer.id, offerInput());
  expect(offer.success).toBe(true);
  const accepted = await negotiation.acceptOffer(f.contract.id, offer.data.id, f.employer.id);
  expect(accepted.success).toBe(true);
  return accepted;
}

async function signAs(f: Fixture, role: 'employer' | 'freelancer', overrides: Record<string, unknown> = {}) {
  const userId = role === 'employer' ? f.employer.id : f.freelancer.id;
  const wallet = role === 'employer' ? f.employerWallet : f.freelancerWallet;
  const payload = await signatures.getSigningPayload(f.contract.id, userId);
  expect(payload.success).toBe(true);
  const { typedData, termsHash } = payload.data;
  const walletSignature = await wallet.signTypedData(typedData.domain, typedData.types, typedData.message);
  return signatures.submitSignature(f.contract.id, userId, {
    termsHash,
    signatureType: 'typed',
    typedName: role === 'employer' ? 'Erin Employer' : 'Fred Freelancer',
    walletAddress: wallet.address,
    walletSignature,
    consent: true,
    ...overrides,
  }, { ipAddress: '127.0.0.1', userAgent: 'jest' });
}

beforeEach(() => {
  for (const s of [contractStore, projectStore, proposalStore, userStore, notificationStore, offerStore, signatureStore]) s.clear();
  jest.clearAllMocks();
  mockGetBlockchainMode.mockReturnValue('simulated');
  mockIsWeb3Available.mockReturnValue(false);
  mockFindExistingDeployment.mockResolvedValue(null);
});

describe('contract-state-machine', () => {
  it('allows only the defined transitions per actor', () => {
    expect(stateMachine.canTransition('negotiating', 'awaiting_signatures', 'system')).toBe(true);
    expect(stateMachine.canTransition('negotiating', 'awaiting_signatures', 'employer')).toBe(false);
    expect(stateMachine.canTransition('awaiting_funding', 'active', 'employer')).toBe(true);
    expect(stateMachine.canTransition('awaiting_funding', 'active', 'freelancer')).toBe(false);
    expect(stateMachine.canTransition('completed', 'active', 'admin')).toBe(false);
    expect(stateMachine.findTransition('pending', 'active')?.allowedRoles).toEqual(['employer']);
  });

  it('transitionContract refuses stale or disallowed transitions', async () => {
    const f = setup();
    expect((await stateMachine.transitionContract('missing', { from: ['negotiating'], to: 'cancelled', actor: 'system' })).ok).toBe(false);
    const stale = await stateMachine.transitionContract(f.contract.id, { from: ['awaiting_funding'], to: 'cancelled', actor: 'system' });
    expect(stale).toMatchObject({ ok: false, code: 'INVALID_STATUS', current: 'negotiating' });
    const disallowed = await stateMachine.transitionContract(f.contract.id, { from: ['negotiating'], to: 'active', actor: 'employer' });
    expect(disallowed).toMatchObject({ ok: false, code: 'INVALID_STATUS_TRANSITION' });
    mockContractRepo.updateContract.mockResolvedValueOnce(null);
    const failed = await stateMachine.transitionContract(f.contract.id, { from: ['negotiating'], to: 'cancelled', actor: 'system' });
    expect(failed).toMatchObject({ ok: false, code: 'UPDATE_FAILED' });
    const ok = await stateMachine.transitionContract(f.contract.id, { from: ['negotiating'], to: 'cancelled', actor: 'system', patch: { cancel_reason: 'x' } });
    expect(ok.ok).toBe(true);
    expect(contractStore.get(f.contract.id)).toMatchObject({ status: 'cancelled', cancel_reason: 'x' });
  });
});

describe('contract-milestone-store', () => {
  it('reads legacy contracts from the project and negotiated ones from the contract', async () => {
    const f = setup();
    const legacy = { ...f.contract, milestone_source: null };
    expect(store.usesContractMilestones(legacy)).toBe(false);
    expect(store.usesContractMilestones({ id: 'x', milestoneSource: 'contract' })).toBe(true);
    expect(store.usesContractMilestones(null)).toBe(false);
    expect((await store.loadMilestoneProject(legacy))?.milestones).toHaveLength(2);

    contractStore.set(f.contract.id, { ...f.contract, milestones: JSON.stringify([{ id: 'c1', amount: 3, status: 'pending' }]) });
    const view = await store.loadMilestoneProject(f.contract);
    expect(view?.milestones).toEqual([{ id: 'c1', amount: 3, status: 'pending' }]);
    expect(store.readContractMilestones({ milestones: '{bad' })).toEqual([]);
    expect(store.readContractMilestones({ milestones: { not: 'array' } })).toEqual([]);

    const saved = await store.saveMilestones(f.contract, f.project.id, [{ id: 'c1', amount: 3, status: 'submitted' }]);
    expect(saved?.milestones[0].status).toBe('submitted');
    expect(projectStore.get(f.project.id).milestones).toHaveLength(2);

    const legacySaved = await store.saveMilestones(legacy, f.project.id, []);
    expect(legacySaved?.milestones).toEqual([]);
  });

  it('returns null when documents are missing and groups milestones for many contracts', async () => {
    const f = setup();
    contractStore.delete(f.contract.id);
    expect(await store.loadMilestoneProject(f.contract)).toBeNull();
    expect(await store.saveMilestones(f.contract, f.project.id, [])).toBeNull();
    contractStore.set(f.contract.id, f.contract);
    projectStore.delete(f.project.id);
    expect(await store.saveMilestones(f.contract, f.project.id, [])).toBeNull();

    const g = setup();
    const legacyA = { ...g.contract, id: 'la', milestone_source: null };
    const legacyB = { ...g.contract, id: 'lb', milestone_source: null };
    const negotiated = { ...g.contract, id: 'neg', milestones: [{ id: 'n1' }] };
    const loader = jest.fn(async (id: string) => projectStore.get(id) ?? null);
    const grouped = await store.loadMilestonesForContracts([legacyA, legacyB, negotiated, { ...legacyA, id: 'orphan', project_id: 'none' }], loader);
    expect(grouped.get('la')).toHaveLength(2);
    expect(grouped.get('neg')).toEqual([{ id: 'n1' }]);
    expect(grouped.get('orphan')).toEqual([]);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('negotiation', () => {
  it('exposes state, floor, template and permissions to each party', async () => {
    const f = setup();
    await negotiation.createSeedOffer(f.contract, f.project, f.proposal);
    const asFreelancer = await negotiation.getNegotiation(f.contract.id, f.freelancer.id);
    expect(asFreelancer.success).toBe(true);
    expect(asFreelancer.data.floor.proposedRate).toBe(2);
    expect(asFreelancer.data.template.milestones).toHaveLength(2);
    expect(asFreelancer.data.openOffer.isSeed).toBe(true);
    expect(asFreelancer.data.permissions).toMatchObject({ canPropose: true, canAccept: true, canDecline: true, canWithdraw: false, canEnd: true, canReopen: false });
    expect(asFreelancer.data.chat).toEqual({ otherPartyId: f.employer.id, projectId: f.project.id });

    const asEmployer = await negotiation.getNegotiation(f.contract.id, f.employer.id);
    expect(asEmployer.data.permissions).toMatchObject({ canAccept: false, canWithdraw: true });

    const asAdmin = await negotiation.getNegotiation(f.contract.id, 'admin-1', 'admin');
    expect(asAdmin.data.role).toBe('admin');
    expect(asAdmin.data.permissions.canPropose).toBe(false);

    expect((await negotiation.getNegotiation(f.contract.id, 'stranger')).error.code).toBe('UNAUTHORIZED');
    expect((await negotiation.getNegotiation('missing', f.employer.id)).error.code).toBe('NOT_FOUND');
    proposalStore.delete(f.proposal.id);
    expect((await negotiation.getNegotiation(f.contract.id, f.employer.id)).error.code).toBe('NOT_FOUND');
  });

  it('enforces the freelancer floor (half the proposed rate) and milestone sums on offers', async () => {
    const f = setup({ floor: 2 });
    const below = await negotiation.createOffer(f.contract.id, f.employer.id, offerInput({ baseAmount: 0.99, additionalPay: 1.51 }));
    expect(below.success).toBe(false);
    expect(below.error.code).toBe('FLOOR_VIOLATION');
    const mismatch = await negotiation.createOffer(f.contract.id, f.employer.id, offerInput({ additionalPay: 0 }));
    expect(mismatch.error.code).toBe('AMOUNT_MISMATCH');
    expect((await negotiation.createOffer(f.contract.id, 'stranger', offerInput())).error.code).toBe('UNAUTHORIZED');
  });

  it('counter-offers mark the open offer countered and own re-offers supersede', async () => {
    const f = setup();
    const seed = await negotiation.createSeedOffer(f.contract, f.project, f.proposal);
    const counter = await negotiation.createOffer(f.contract.id, f.freelancer.id, offerInput({ message: ' more scope ' }));
    expect(counter.success).toBe(true);
    expect(counter.data.parentOfferId).toBe(seed.id);
    expect(counter.data.message).toBe('more scope');
    expect(offerStore.get(seed.id).status).toBe('countered');

    const revised = await negotiation.createOffer(f.contract.id, f.freelancer.id, offerInput({ additionalPay: 1, milestones: [{ title: 'All', amount: 3, dueDate: day(30) }] }));
    expect(revised.success).toBe(true);
    expect(offerStore.get(counter.data.id).status).toBe('superseded');
    expect(revised.data.parentOfferId).toBeNull();
    expect(mockNotificationRepo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'contract_offer_received', user_id: f.employer.id }));
  });

  it('accepting locks terms, materializes contract milestones and requests signatures', async () => {
    const f = setup();
    const accepted = await lockTerms(f);
    expect(accepted.data.status).toBe('awaiting_signatures');
    const stored = contractStore.get(f.contract.id);
    expect(stored.milestones).toHaveLength(2);
    expect(stored.milestones[0]).toMatchObject({ title: 'Design', amount: 1, status: 'pending', contract_id: f.contract.id });
    expect(stored.total_amount).toBe(2.5);
    expect(stored.additional_pay).toBe(0.5);
    expect(stored.terms_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(stored.terms_snapshot.employerWallet).toBe(f.employerWallet.address);
    expect(mockLockAgreementTerms).toHaveBeenCalledWith(expect.objectContaining({ termsHash: stored.terms_hash, milestoneCount: 2 }));
    expect(mockNotificationRepo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'contract_signature_requested', user_id: f.freelancer.id }));
    expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({ action: 'contract.terms_locked' }));
  });

  it('rejects invalid accepts', async () => {
    const f = setup();
    const offer = await negotiation.createOffer(f.contract.id, f.freelancer.id, offerInput());
    expect((await negotiation.acceptOffer(f.contract.id, offer.data.id, f.freelancer.id)).error.code).toBe('CANNOT_ACCEPT_OWN_OFFER');
    expect((await negotiation.acceptOffer(f.contract.id, 'nope', f.employer.id)).error.code).toBe('NOT_FOUND');
    expect((await negotiation.acceptOffer(f.contract.id, offer.data.id, 'stranger')).error.code).toBe('UNAUTHORIZED');

    offerStore.set(offer.data.id, { ...offerStore.get(offer.data.id), base_amount: 9 });
    expect((await negotiation.acceptOffer(f.contract.id, offer.data.id, f.employer.id)).error.code).toBe('AMOUNT_MISMATCH');
    offerStore.set(offer.data.id, { ...offerStore.get(offer.data.id), base_amount: 2, offer_hash: '0xdead' });
    expect((await negotiation.acceptOffer(f.contract.id, offer.data.id, f.employer.id)).error.code).toBe('OFFER_INTEGRITY_FAILED');
  });

  it('requires both wallets before terms can lock and compensates a failed transition', async () => {
    const f = setup();
    const offer = await negotiation.createOffer(f.contract.id, f.freelancer.id, offerInput());
    userStore.set(f.employer.id, { ...f.employer, wallet_address: null });
    expect((await negotiation.acceptOffer(f.contract.id, offer.data.id, f.employer.id)).error.code).toBe('MISSING_WALLET');
    userStore.set(f.employer.id, f.employer);

    mockContractRepo.updateContract.mockResolvedValueOnce(null);
    const failed = await negotiation.acceptOffer(f.contract.id, offer.data.id, f.employer.id);
    expect(failed.error.code).toBe('UPDATE_FAILED');
    expect(offerStore.get(offer.data.id).status).toBe('pending');

    mockLockAgreementTerms.mockRejectedValueOnce(new Error('ledger down'));
    const ok = await negotiation.acceptOffer(f.contract.id, offer.data.id, f.employer.id);
    expect(ok.success).toBe(true);
    expect((await negotiation.acceptOffer(f.contract.id, offer.data.id, f.employer.id)).error.code).toBe('INVALID_STATUS');
  });

  it('declines, withdraws and ends negotiations (releasing the slot)', async () => {
    const f = setup();
    const offer = await negotiation.createOffer(f.contract.id, f.employer.id, offerInput());
    expect((await negotiation.declineOffer(f.contract.id, offer.data.id, f.employer.id)).error.code).toBe('CANNOT_DECLINE_OWN_OFFER');
    const declined = await negotiation.declineOffer(f.contract.id, offer.data.id, f.freelancer.id, { reason: 'too low' });
    expect(declined.data).toMatchObject({ contractCancelled: false });
    expect(declined.data.offer.status).toBe('declined');
    expect(declined.data.offer.message).toContain('Declined: too low');
    expect((await negotiation.declineOffer(f.contract.id, offer.data.id, f.freelancer.id)).error.code).toBe('OFFER_NOT_OPEN');

    const second = await negotiation.createOffer(f.contract.id, f.employer.id, offerInput());
    expect((await negotiation.withdrawOffer(f.contract.id, second.data.id, f.freelancer.id)).error.code).toBe('UNAUTHORIZED');
    const withdrawn = await negotiation.withdrawOffer(f.contract.id, second.data.id, f.employer.id);
    expect(withdrawn.data.status).toBe('withdrawn');
    expect((await negotiation.withdrawOffer(f.contract.id, second.data.id, f.employer.id)).error.code).toBe('OFFER_NOT_OPEN');
    expect((await negotiation.withdrawOffer(f.contract.id, 'nope', f.employer.id)).error.code).toBe('NOT_FOUND');

    const third = await negotiation.createOffer(f.contract.id, f.employer.id, offerInput());
    const ended = await negotiation.declineOffer(f.contract.id, third.data.id, f.freelancer.id, { endNegotiation: true });
    expect(ended.data.contractCancelled).toBe(true);
    expect(contractStore.get(f.contract.id)).toMatchObject({ status: 'cancelled', cancel_reason: 'negotiation_ended', cancelled_by: f.freelancer.id });
    expect(proposalStore.get(f.proposal.id).status).toBe('withdrawn');
    expect(mockCancelAgreement).toHaveBeenCalledWith(f.contract.id);
    expect((await negotiation.createOffer(f.contract.id, f.employer.id, offerInput())).error.code).toBe('INVALID_STATUS');
  });

  it('caps the number of negotiation rounds', async () => {
    const f = setup();
    for (let i = 0; i < 30; i++) {
      offerStore.set(`o${i}`, { id: `o${i}`, contract_id: f.contract.id, status: 'superseded', created_at: stamp() });
    }
    expect((await negotiation.createOffer(f.contract.id, f.employer.id, offerInput())).error.code).toBe('NEGOTIATION_LIMIT_REACHED');
  });

  it('reopening voids signatures and clears locked terms', async () => {
    const f = setup();
    await lockTerms(f);
    expect((await signAs(f, 'freelancer')).success).toBe(true);
    const reopened = await negotiation.reopenNegotiation(f.contract.id, f.employer.id);
    expect(reopened.data.status).toBe('negotiating');
    const stored = contractStore.get(f.contract.id);
    expect(stored.terms_hash).toBeNull();
    expect(stored.milestones).toEqual([]);
    expect([...signatureStore.values()].every(s => s.status === 'voided')).toBe(true);
    expect((await negotiation.reopenNegotiation(f.contract.id, f.employer.id)).error.code).toBe('INVALID_STATUS');
    expect((await negotiation.reopenNegotiation(f.contract.id, 'stranger')).error.code).toBe('UNAUTHORIZED');
    expect((await negotiation.reopenNegotiation('missing', f.employer.id)).error.code).toBe('NOT_FOUND');
  });

  it('seed offers tolerate failures', async () => {
    const f = setup();
    mockOfferRepo.createOffer.mockRejectedValueOnce(new Error('db'));
    expect(await negotiation.createSeedOffer(f.contract, f.project, f.proposal)).toBeNull();
  });

  it('maps offers stored with JSON-string milestones', () => {
    const mapped = negotiation.mapContractOfferFromEntity({ id: 'o', contract_id: 'c', milestones: '[{"title":"A"}]', is_seed: false } as any);
    expect(mapped.milestones).toEqual([{ title: 'A' }]);
    expect(negotiation.mapContractOfferFromEntity({ id: 'o', milestones: '{bad' } as any).milestones).toEqual([]);
  });
});

describe('signatures', () => {
  it('freelancer signs first, then the employer signature starts the funding window', async () => {
    const f = setup();
    await lockTerms(f);

    const employerFirst = await signAs(f, 'employer');
    expect(employerFirst.error.code).toBe('FREELANCER_SIGNATURE_REQUIRED');

    const freelancerSig = await signAs(f, 'freelancer');
    expect(freelancerSig.success).toBe(true);
    expect(freelancerSig.data.signature).toMatchObject({ signerRole: 'freelancer', signatureType: 'typed', ipAddress: '127.0.0.1' });
    expect(mockSignAgreement).toHaveBeenCalledWith(f.contract.id, f.freelancerWallet.address);
    expect((await signAs(f, 'freelancer')).error.code).toBe('ALREADY_SIGNED');

    const payload = await signatures.getSigningPayload(f.contract.id, f.employer.id);
    expect(payload.data).toMatchObject({ nextSigner: 'employer', canSign: true, chainId: 1337, chainIdHex: '0x539', projectTitle: 'Escrow dApp' });
    expect(payload.data.signatures[0].ipAddress).toBeUndefined();

    const employerSig = await signAs(f, 'employer');
    expect(employerSig.success).toBe(true);
    expect(employerSig.data.contract.status).toBe('awaiting_funding');
    const stored = contractStore.get(f.contract.id);
    expect(Date.parse(stored.funding_deadline) - Date.parse(stored.fully_signed_at)).toBe(72 * 3600 * 1000);
    expect(mockNotificationRepo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'contract_awaiting_funding', user_id: f.employer.id }));

    const list = await signatures.listSignatures(f.contract.id, f.employer.id);
    expect(list.data).toHaveLength(2);
    expect(list.data.find(s => s.signerRole === 'employer').ipAddress).toBe('127.0.0.1');
    const adminList = await signatures.listSignatures(f.contract.id, 'admin', 'admin');
    expect(adminList.data.every(s => s.ipAddress === '127.0.0.1')).toBe(true);
  });

  it('rejects wallet signatures from the wrong wallet or over other terms', async () => {
    const f = setup();
    await lockTerms(f);
    const payload = (await signatures.getSigningPayload(f.contract.id, f.freelancer.id)).data;
    const stranger = Wallet.createRandom();
    const foreign = await stranger.signTypedData(payload.typedData.domain, payload.typedData.types, payload.typedData.message);
    const base = { termsHash: payload.termsHash, signatureType: 'typed', typedName: 'Fred', walletAddress: f.freelancerWallet.address, consent: true };

    expect((await signatures.submitSignature(f.contract.id, f.freelancer.id, { ...base, walletSignature: foreign })).error.code).toBe('SIGNATURE_INVALID');
    expect((await signatures.submitSignature(f.contract.id, f.freelancer.id, { ...base, walletSignature: '0x1234' })).error.code).toBe('SIGNATURE_INVALID');
    const own = await f.freelancerWallet.signTypedData(payload.typedData.domain, payload.typedData.types, payload.typedData.message);
    expect((await signatures.submitSignature(f.contract.id, f.freelancer.id, { ...base, walletAddress: 'not-an-address', walletSignature: own })).error.code).toBe('SIGNATURE_INVALID');
    expect((await signatures.submitSignature(f.contract.id, f.freelancer.id, { ...base, consent: false, walletSignature: own })).error.code).toBe('CONSENT_REQUIRED');
    expect((await signatures.submitSignature(f.contract.id, f.freelancer.id, { ...base, termsHash: `0x${'1'.repeat(64)}`, walletSignature: own })).error.code).toBe('TERMS_HASH_MISMATCH');
    expect((await signatures.submitSignature(f.contract.id, 'stranger', { ...base, walletSignature: own })).error.code).toBe('UNAUTHORIZED');
    expect((await signatures.submitSignature('missing', f.freelancer.id, { ...base, walletSignature: own })).error.code).toBe('NOT_FOUND');

    userStore.set(f.freelancer.id, { ...f.freelancer, wallet_address: stranger.address });
    expect((await signatures.submitSignature(f.contract.id, f.freelancer.id, { ...base, walletSignature: own })).error.code).toBe('WALLET_CHANGED');
    userStore.set(f.freelancer.id, f.freelancer);

    const tampered = { ...contractStore.get(f.contract.id) };
    tampered.terms_snapshot = { ...tampered.terms_snapshot, deadline: day(99) };
    contractStore.set(f.contract.id, tampered);
    expect((await signatures.submitSignature(f.contract.id, f.freelancer.id, { ...base, walletSignature: own })).error.code).toBe('TERMS_INTEGRITY_FAILED');
  });

  it('validates the adopted drawn or typed signature', async () => {
    const f = setup();
    await lockTerms(f);
    const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64')}`;
    expect((await signAs(f, 'freelancer', { signatureType: 'typed', typedName: '' })).error.message).toContain('Type your full name');
    expect((await signAs(f, 'freelancer', { typedName: 'X' })).error.code).toBe('INVALID_SIGNATURE');
    expect((await signAs(f, 'freelancer', { signatureType: 'stamp' })).error.message).toBe('Unsupported signature type');
    expect((await signAs(f, 'freelancer', { signatureType: 'drawn', signatureImage: 'data:image/jpeg;base64,AAAA' })).error.message).toContain('PNG');
    expect((await signAs(f, 'freelancer', { signatureType: 'drawn', signatureImage: 'data:image/png;base64,' })).error.message).toContain('100 KB');
    expect((await signAs(f, 'freelancer', { signatureType: 'drawn', signatureImage: `data:image/png;base64,${Buffer.from('notpng!!').toString('base64')}` })).error.message).toContain('PNG');
    const drawn = await signAs(f, 'freelancer', { signatureType: 'drawn', signatureImage: png, typedName: undefined });
    expect(drawn.success).toBe(true);
    expect(drawn.data.signature.signatureImage).toBe(png);
  });

  it('payload requires locked terms and a party (admins get a read-only view)', async () => {
    const f = setup();
    expect((await signatures.getSigningPayload(f.contract.id, f.freelancer.id)).error.code).toBe('TERMS_NOT_LOCKED');
    expect((await signatures.getSigningPayload(f.contract.id, 'stranger')).error.code).toBe('UNAUTHORIZED');
    expect((await signatures.getSigningPayload('missing', f.freelancer.id)).error.code).toBe('NOT_FOUND');
    expect((await signatures.listSignatures(f.contract.id, 'stranger')).error.code).toBe('UNAUTHORIZED');
    expect((await signatures.listSignatures('missing', 'x')).error.code).toBe('NOT_FOUND');
    await lockTerms(f);
    const admin = await signatures.getSigningPayload(f.contract.id, 'admin', 'admin');
    expect(admin.data.typedData).toBeNull();
    expect(admin.data.canSign).toBe(false);
  });

  it('uses the provider chain id in real mode and falls back on errors', async () => {
    mockGetBlockchainMode.mockReturnValue('real');
    mockIsWeb3Available.mockReturnValue(true);
    expect(await signatures.resolveSigningChainId()).toBe(31337);
    mockGetNetwork.mockRejectedValueOnce(new Error('rpc'));
    expect(await signatures.resolveSigningChainId()).toBe(1337);
    mockIsWeb3Available.mockReturnValue(false);
    expect(await signatures.resolveSigningChainId()).toBe(1337);
  });

  it('refuses to sign outside awaiting_signatures and reports a failed funding transition', async () => {
    const f = setup();
    await lockTerms(f);
    expect((await signAs(f, 'freelancer')).success).toBe(true);
    mockContractRepo.updateContract.mockResolvedValueOnce(null);
    const failed = await signAs(f, 'employer');
    expect(failed.error.code).toBe('UPDATE_FAILED');
    contractStore.set(f.contract.id, { ...contractStore.get(f.contract.id), status: 'awaiting_funding' });
    const payload = await signatures.getSigningPayload(f.contract.id, f.employer.id);
    expect(payload.data.nextSigner).toBeNull();
  });
});

describe('lifecycle', () => {
  it('releases the slot when a party cancels and reopens an in-progress project', async () => {
    const f = setup({ status: 'awaiting_signatures' });
    projectStore.set(f.project.id, { ...f.project, status: 'in_progress' });
    const result = await lifecycle.releaseContractSlot({ contractId: f.contract.id, actorId: f.employer.id, actor: 'employer', reason: 'cancelled_by_party' });
    expect(result.success).toBe(true);
    expect(proposalStore.get(f.proposal.id).status).toBe('rejected');
    expect(projectStore.get(f.project.id).status).toBe('open');
    expect(mockNotificationRepo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ user_id: f.freelancer.id, type: 'contract_negotiation_cancelled' }));
    expect((await lifecycle.releaseContractSlot({ contractId: f.contract.id, actorId: null, actor: 'system', reason: 'funding_expired' })).error.code).toBe('INVALID_STATUS');
    expect((await lifecycle.releaseContractSlot({ contractId: 'missing', actorId: null, actor: 'system', reason: 'funding_expired' })).error.code).toBe('NOT_FOUND');
  });

  it('keeps going when side effects fail during release', async () => {
    const f = setup();
    mockProposalRepo.updateProposal.mockRejectedValueOnce(new Error('db'));
    mockCancelAgreement.mockRejectedValueOnce(new Error('ledger'));
    mockProjectRepo.findProjectById.mockRejectedValueOnce(new Error('db')).mockRejectedValueOnce(new Error('db'));
    const result = await lifecycle.releaseContractSlot({ contractId: f.contract.id, actorId: f.freelancer.id, actor: 'freelancer', reason: 'negotiation_ended' });
    expect(result.success).toBe(true);
  });

  it('activation starts the first milestone, fills the project and rejects remaining applicants', async () => {
    const f = setup();
    await lockTerms(f);
    const other = createTestProposal({ id: 'other', project_id: f.project.id, status: 'pending' });
    proposalStore.set(other.id, other);
    contractStore.set(f.contract.id, { ...contractStore.get(f.contract.id), status: 'active' });

    await lifecycle.onContractActivated(f.contract.id);
    const stored = contractStore.get(f.contract.id);
    expect(stored.funded_at).toBeDefined();
    expect(stored.milestones[0].status).toBe('in_progress');
    expect(proposalStore.get('other').status).toBe('rejected');
    expect(projectStore.get(f.project.id).status).toBe('in_progress');
    expect(mockNotificationRepo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'contract_activated' }));
  });

  it('activation leaves other applicants pending while slots remain unfunded', async () => {
    const f = setup({ freelancerLimit: 2 });
    contractStore.set(f.contract.id, { ...f.contract, status: 'active', milestones: [] });
    const other = createTestProposal({ id: 'other2', project_id: f.project.id, status: 'pending' });
    proposalStore.set(other.id, other);
    await lifecycle.onContractActivated(f.contract.id);
    expect(proposalStore.get('other2').status).toBe('pending');
    await lifecycle.onContractActivated('missing');
    mockContractRepo.getContractById.mockRejectedValueOnce(new Error('db'));
    await expect(lifecycle.onContractActivated(f.contract.id)).resolves.toBeUndefined();
  });

  it('expires overdue funding (cron + lazy) and frees the slot', async () => {
    const f = setup({ status: 'awaiting_funding' });
    const overdue = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    contractStore.set(f.contract.id, { ...f.contract, status: 'awaiting_funding', funding_deadline: overdue });

    expect(await lifecycle.expireOverdueFunding()).toBe(1);
    expect(contractStore.get(f.contract.id)).toMatchObject({ status: 'cancelled', cancel_reason: 'funding_expired' });
    expect(proposalStore.get(f.proposal.id).status).toBe('rejected');
    expect(mockNotificationRepo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'contract_funding_expired' }));

    const g = setup({ status: 'awaiting_funding' });
    contractStore.set(g.contract.id, { ...g.contract, status: 'awaiting_funding', funding_deadline: overdue });
    expect(await lifecycle.expireIfOverdue(contractStore.get(g.contract.id))).toBe(true);
    expect(await lifecycle.expireIfOverdue({ id: 'x', status: 'active' })).toBe(false);
    expect(await lifecycle.expireIfOverdue({ id: 'x', status: 'awaiting_funding', funding_deadline: new Date(Date.now() + 3600e3).toISOString() })).toBe(false);
  });

  it('never expires within the grace window, once funded, or when a deployment exists', async () => {
    const f = setup({ status: 'awaiting_funding' });
    const justPassed = new Date(Date.now() - 60 * 1000).toISOString();
    contractStore.set(f.contract.id, { ...f.contract, status: 'awaiting_funding', funding_deadline: justPassed });
    expect(await lifecycle.expireContractIfOverdue(f.contract.id)).toBe(false);

    const overdue = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    contractStore.set(f.contract.id, { ...f.contract, status: 'awaiting_funding', funding_deadline: overdue, escrow_address: '0xabc' });
    expect(await lifecycle.expireContractIfOverdue(f.contract.id)).toBe(false);

    contractStore.set(f.contract.id, { ...f.contract, status: 'awaiting_funding', funding_deadline: overdue, escrow_address: '' });
    mockGetBlockchainMode.mockReturnValue('real');
    mockIsWeb3Available.mockReturnValue(true);
    mockFindExistingDeployment.mockResolvedValueOnce({ escrowAddress: '0x1', transactionHash: '0x2' });
    expect(await lifecycle.expireContractIfOverdue(f.contract.id)).toBe(false);
    expect(mockNotificationRepo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Finish registering your escrow' }));

    mockFindExistingDeployment.mockRejectedValueOnce(new Error('rpc'));
    expect(await lifecycle.expireContractIfOverdue(f.contract.id)).toBe(false);

    mockIsWeb3Available.mockReturnValue(false);
    expect(await lifecycle.expireContractIfOverdue(f.contract.id)).toBe(true);

    contractStore.set('bad', { ...f.contract, id: 'bad', status: 'awaiting_funding', funding_deadline: 'not-a-date' });
    expect(await lifecycle.expireContractIfOverdue('bad')).toBe(false);
  });

  it('sends one funding reminder inside the last 24 hours', async () => {
    const f = setup({ status: 'awaiting_funding' });
    const soon = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    contractStore.set(f.contract.id, { ...f.contract, status: 'awaiting_funding', funding_deadline: soon });
    const g = setup({ status: 'awaiting_funding' });
    contractStore.set(g.contract.id, { ...g.contract, status: 'awaiting_funding', funding_deadline: new Date(Date.now() - 1000).toISOString() });

    expect(await lifecycle.sendFundingReminders()).toBe(1);
    expect(contractStore.get(f.contract.id).funding_reminder_sent_at).toBeDefined();
    expect(await lifecycle.sendFundingReminders()).toBe(0);

    const h = setup({ status: 'awaiting_funding' });
    contractStore.set(h.contract.id, { ...h.contract, status: 'awaiting_funding', funding_deadline: soon });
    mockContractRepo.updateContract.mockRejectedValueOnce(new Error('db'));
    expect(await lifecycle.sendFundingReminders()).toBe(0);
  });

  it('reports contract roles', () => {
    const f = setup();
    expect(lifecycle.contractRoleOf(f.contract, f.employer.id)).toBe('employer');
    expect(lifecycle.contractRoleOf(f.contract, f.freelancer.id)).toBe('freelancer');
    expect(lifecycle.contractRoleOf(f.contract, 'x')).toBeNull();
  });
});

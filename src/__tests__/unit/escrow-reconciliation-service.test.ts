// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

const mockListDocuments = jest.fn();
jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: { listDocuments: mockListDocuments },
  DATABASE_ID: 'db',
  Query: {
    limit: (n: number) => `limit(${n})`,
    cursorAfter: (id: string) => `cursorAfter(${id})`,
  },
}));

const mockGetEscrowState = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  getEscrowState: mockGetEscrowState,
}));

const mockGetContractById = jest.fn();
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: { getContractById: mockGetContractById },
}));

const mockGetProjectById = jest.fn();
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: { getProjectById: mockGetProjectById },
}));

const mockFindByContractId = jest.fn();
jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  paymentRepository: { findByContractId: mockFindByContractId },
}));

const service = await import('../../services/escrow-reconciliation-service.js');

const wei = (eth: number) => BigInt(Math.round(eth * 1e18));

function makeEscrow(overrides = {}) {
  return {
    address: '0xescrow',
    contractId: 'c1',
    totalAmount: wei(1000),
    balance: wei(500),
    milestones: [
      { id: 'ms1', amount: wei(500), status: 'released' },
      { id: 'ms2', amount: wei(500), status: 'pending' },
    ],
    ...overrides,
  };
}

function makeContract(overrides = {}) {
  return {
    id: 'c1',
    project_id: 'p1',
    total_amount: 1000,
    status: 'active',
    ...overrides,
  };
}

function makeProject(milestones = [
  { id: 'ms1', title: 'M1', amount: 500, status: 'approved' },
  { id: 'ms2', title: 'M2', amount: 500, status: 'pending' },
]) {
  return { id: 'p1', milestones };
}

function makePayment(overrides = {}) {
  return {
    id: 'pay1',
    contract_id: 'c1',
    milestone_id: 'ms1',
    payer_id: 'employer',
    payee_id: 'freelancer',
    amount: 500,
    currency: 'ETH',
    tx_hash: '0xabc',
    status: 'completed',
    payment_type: 'milestone_release',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A fully consistent contract: ledger, read model, and payments log all agree. */
function seedCleanScenario() {
  mockListDocuments.mockResolvedValue({ documents: [{ address: '0xescrow', contract_id: 'c1' }], total: 1 });
  mockGetEscrowState.mockResolvedValue(makeEscrow());
  mockGetContractById.mockResolvedValue(makeContract());
  mockGetProjectById.mockResolvedValue(makeProject());
  mockFindByContractId.mockResolvedValue([
    makePayment(), // ms1 release
    makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
  ]);
}

describe('reconcileContractPayments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no issues for a consistent contract', async () => {
    seedCleanScenario();
    const result = await service.reconcileContractPayments();
    expect(result).toEqual({ checkedContracts: 1, issues: [] });
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns an empty result when the escrow registry is empty', async () => {
    mockListDocuments.mockResolvedValue({ documents: [], total: 0 });
    const result = await service.reconcileContractPayments();
    expect(result).toEqual({ checkedContracts: 0, issues: [] });
    expect(mockGetEscrowState).not.toHaveBeenCalled();
  });

  it('skips registry entries missing an address or contract id', async () => {
    mockListDocuments.mockResolvedValue({
      documents: [
        { address: '', contract_id: 'c1' },
        { address: '0xescrow', contract_id: '' },
        { address: '0xescrow', contract_id: 'c2' },
        { $id: 'no-fields' }, // neither field present → both ?? fallbacks
      ],
      total: 4,
    });
    mockGetEscrowState.mockResolvedValue(makeEscrow());
    mockGetContractById.mockResolvedValue(makeContract());
    mockGetProjectById.mockResolvedValue(makeProject());
    mockFindByContractId.mockResolvedValue([]);
    const result = await service.reconcileContractPayments();
    expect(result.checkedContracts).toBe(1);
    expect(mockGetEscrowState).toHaveBeenCalledTimes(1);
  });

  it('paginates through the escrow registry with cursorAfter', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      $id: `escrow-${i}`,
      address: `0xa${i}`,
      contract_id: `c${i}`,
    }));
    mockListDocuments
      .mockResolvedValueOnce({ documents: page1, total: 101 })
      .mockResolvedValueOnce({ documents: [{ $id: 'escrow-last', address: '0xlast', contract_id: 'clast' }], total: 101 });
    mockGetEscrowState.mockResolvedValue(makeEscrow());
    mockGetContractById.mockResolvedValue(makeContract());
    mockGetProjectById.mockResolvedValue(makeProject());
    mockFindByContractId.mockResolvedValue([]);
    const result = await service.reconcileContractPayments();
    expect(mockListDocuments).toHaveBeenCalledTimes(2);
    expect(mockListDocuments.mock.calls[1][2]).toContain('cursorAfter(escrow-99)');
    expect(result.checkedContracts).toBe(101);
  });

  it('stops paginating when a full page has no last id', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ address: `0xa${i}`, contract_id: `c${i}` }));
    mockListDocuments.mockResolvedValue({ documents: page1, total: 100 });
    mockGetEscrowState.mockResolvedValue(makeEscrow());
    mockGetContractById.mockResolvedValue(makeContract());
    mockGetProjectById.mockResolvedValue(makeProject());
    mockFindByContractId.mockResolvedValue([]);
    const result = await service.reconcileContractPayments();
    expect(mockListDocuments).toHaveBeenCalledTimes(1);
    expect(result.checkedContracts).toBe(100);
  });

  it('logs and continues when the escrow registry fetch fails', async () => {
    mockListDocuments.mockRejectedValue(new Error('db down'));
    const result = await service.reconcileContractPayments();
    expect(result).toEqual({ checkedContracts: 0, issues: [] });
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to run escrow reconciliation job', expect.any(Error));
  });

  it('logs and skips a contract whose reconciliation throws', async () => {
    mockListDocuments.mockResolvedValue({ documents: [{ address: '0xescrow', contract_id: 'c1' }], total: 1 });
    mockGetEscrowState.mockRejectedValue(new Error('ledger down'));
    const result = await service.reconcileContractPayments();
    expect(result.checkedContracts).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to reconcile escrow contract against ledger',
      expect.objectContaining({ contractId: 'c1', error: 'ledger down' })
    );
  });

  it('flags an escrow whose ledger state is missing', async () => {
    mockListDocuments.mockResolvedValue({ documents: [{ address: '0xescrow', contract_id: 'c1' }], total: 1 });
    mockGetEscrowState.mockResolvedValue(null);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'critical', code: 'ESCROW_STATE_MISSING', contractId: 'c1' }),
    ]);
    expect(mockLogger.error).toHaveBeenCalledWith('Escrow reconciliation issue', expect.any(Object));
  });

  it('flags an escrow whose contract is missing', async () => {
    mockListDocuments.mockResolvedValue({ documents: [{ address: '0xescrow', contract_id: 'c1' }], total: 1 });
    mockGetEscrowState.mockResolvedValue(makeEscrow());
    mockGetContractById.mockResolvedValue(null);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'CONTRACT_MISSING' })]);
  });

  it('flags a contract whose project is missing', async () => {
    mockListDocuments.mockResolvedValue({ documents: [{ address: '0xescrow', contract_id: 'c1' }], total: 1 });
    mockGetEscrowState.mockResolvedValue(makeEscrow());
    mockGetContractById.mockResolvedValue(makeContract());
    mockGetProjectById.mockResolvedValue(null);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'PROJECT_MISSING' })]);
  });

  it('flags a contract without a project_id', async () => {
    mockListDocuments.mockResolvedValue({ documents: [{ address: '0xescrow', contract_id: 'c1' }], total: 1 });
    mockGetEscrowState.mockResolvedValue(makeEscrow());
    mockGetContractById.mockResolvedValue(makeContract({ project_id: undefined }));
    mockGetProjectById.mockResolvedValue(null);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'PROJECT_MISSING' })]);
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it('flags a total amount mismatch between the ledger and the contract', async () => {
    seedCleanScenario();
    // balance (499) + settled (500) still conserves the (wrong) total 999
    mockGetEscrowState.mockResolvedValue(makeEscrow({ totalAmount: wei(999), balance: wei(499) }));
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'TOTAL_MISMATCH', expected: wei(1000).toString(), actual: wei(999).toString() })]);
  });

  it('flags an escrow balance that does not conserve the total', async () => {
    seedCleanScenario();
    mockGetEscrowState.mockResolvedValue(makeEscrow({ balance: wei(400) }));
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'BALANCE_MISMATCH' })]);
  });

  it('flags a ledger milestone missing from the project read model', async () => {
    seedCleanScenario();
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'released' },
        { id: 'msX', amount: wei(500), status: 'pending' },
      ],
    }));
    // project has only ms1 so the extra ledger milestone is the sole divergence
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'approved' },
    ]));
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'MILESTONE_MISSING_IN_DB', milestoneId: 'msX' })]);
  });

  it('flags a milestone amount mismatch between the ledger and the read model', async () => {
    seedCleanScenario();
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(600), status: 'released' },
        { id: 'ms2', amount: wei(500), status: 'pending' },
      ],
      // balance conserves the total with the (wrong) 600 settled amount
      balance: wei(400),
    }));
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'MILESTONE_AMOUNT_MISMATCH', milestoneId: 'ms1' })]);
  });

  it('flags a DB milestone that is not settled while the ledger released it', async () => {
    seedCleanScenario();
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'submitted' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'pending' },
    ]));
    // no release record — the DB never settled ms1, so the settled totals still match
    mockFindByContractId.mockResolvedValue([
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'MILESTONE_STATUS_MISMATCH', milestoneId: 'ms1', expected: 'approved', actual: 'submitted' })]);
  });

  it('flags a DB milestone settled while the ledger refunded a different state', async () => {
    seedCleanScenario();
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'refunded' },
        { id: 'ms2', amount: wei(500), status: 'pending' },
      ],
    }));
    // ms1 is approved in the DB but refunded in the ledger
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'MILESTONE_STATUS_MISMATCH', milestoneId: 'ms1', expected: 'refunded', actual: 'approved' })]);
  });

  it('flags a DB milestone settled while the ledger still has it pending', async () => {
    seedCleanScenario();
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'pending' },
        { id: 'ms2', amount: wei(500), status: 'pending' },
      ],
      // nothing settled in the ledger, so the full amount is still in escrow
      balance: wei(1000),
    }));
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'MILESTONE_STATUS_MISMATCH', milestoneId: 'ms1', expected: 'pending', actual: 'approved' })]);
  });

  it('accepts a refunded DB milestone matching a refunded ledger milestone', async () => {
    seedCleanScenario();
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'refunded' },
        { id: 'ms2', amount: wei(500), status: 'pending' },
      ],
    }));
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'refunded' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'pending' },
    ]));
    mockFindByContractId.mockResolvedValue([
      makePayment({ payment_type: 'refund', payer_id: 'freelancer', payee_id: 'employer' }),
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([]);
  });

  it('warns about a project milestone missing from the escrow ledger', async () => {
    seedCleanScenario();
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'approved' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'pending' },
      { id: 'ms9', title: 'M9', amount: 100, status: 'pending' },
    ]));
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'MILESTONE_MISSING_IN_ESCROW', milestoneId: 'ms9' })]);
    expect(mockLogger.warn).toHaveBeenCalledWith('Escrow reconciliation issue', expect.any(Object));
  });

  it('reports a payment-record fetch failure without cascading record checks', async () => {
    seedCleanScenario();
    mockFindByContractId.mockRejectedValue(new Error('payments down'));
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'PAYMENTS_FETCH_FAILED' })]);
    // No deposit/settled-total alerts from the failed read
    expect(result.issues.filter(i => i.code !== 'PAYMENTS_FETCH_FAILED')).toEqual([]);
  });

  it('reports a non-Error payment-record fetch failure', async () => {
    seedCleanScenario();
    mockFindByContractId.mockRejectedValue('payments down');
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'PAYMENTS_FETCH_FAILED', actual: 'payments down' })]);
  });

  it('logs a non-Error failure from a contract reconciliation', async () => {
    mockListDocuments.mockResolvedValue({ documents: [{ address: '0xescrow', contract_id: 'c1' }], total: 1 });
    mockGetEscrowState.mockRejectedValue('ledger down');
    const result = await service.reconcileContractPayments();
    expect(result.checkedContracts).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to reconcile escrow contract against ledger',
      expect.objectContaining({ contractId: 'c1', error: 'ledger down' })
    );
  });

  it('warns when no escrow_deposit record exists for a funded contract', async () => {
    seedCleanScenario();
    mockFindByContractId.mockResolvedValue([makePayment()]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', code: 'DEPOSIT_MISSING' })]);
  });

  it('warns when the escrow_deposit record amount does not match the contract total', async () => {
    seedCleanScenario();
    mockFindByContractId.mockResolvedValue([
      makePayment(),
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 900, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'DEPOSIT_AMOUNT_MISMATCH', expected: 1000, actual: 900 })]);
  });

  it('warns when an approved milestone has no release or dispute record', async () => {
    seedCleanScenario();
    mockFindByContractId.mockResolvedValue([
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    // the missing record also makes the settled totals diverge — both are real findings
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', code: 'RELEASE_RECORD_MISSING', milestoneId: 'ms1' }),
      expect.objectContaining({ severity: 'critical', code: 'SETTLED_TOTAL_MISMATCH' }),
    ]));
  });

  it('accepts an approved milestone covered by a dispute_resolution record', async () => {
    seedCleanScenario();
    mockFindByContractId.mockResolvedValue([
      makePayment({ payment_type: 'dispute_resolution', payer_id: 'employer', payee_id: 'freelancer' }),
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([]);
  });

  it('warns when a refunded milestone has no refund or dispute record', async () => {
    seedCleanScenario();
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'refunded' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'pending' },
    ]));
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'refunded' },
        { id: 'ms2', amount: wei(500), status: 'pending' },
      ],
    }));
    mockFindByContractId.mockResolvedValue([
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    // the missing record also makes the settled totals diverge — both are real findings
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', code: 'REFUND_RECORD_MISSING', milestoneId: 'ms1' }),
      expect.objectContaining({ severity: 'critical', code: 'SETTLED_TOTAL_MISMATCH' }),
    ]));
  });

  it('accepts a refunded milestone covered by a dispute_resolution record', async () => {
    seedCleanScenario();
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'refunded' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'pending' },
    ]));
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'refunded' },
        { id: 'ms2', amount: wei(500), status: 'pending' },
      ],
    }));
    mockFindByContractId.mockResolvedValue([
      makePayment({ payment_type: 'dispute_resolution', payer_id: 'freelancer', payee_id: 'employer' }),
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([]);
  });

  it('flags a settled-total mismatch between the DB and the payments log', async () => {
    seedCleanScenario();
    // ms1 approved (500) + ms2 approved (500) = 1000, but ms2's record is 300
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'approved' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'approved' },
    ]));
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'released' },
        { id: 'ms2', amount: wei(500), status: 'released' },
      ],
      // both milestones settled in the ledger — balance conserves the total
      balance: wei(0),
    }));
    mockFindByContractId.mockResolvedValue([
      makePayment(), // ms1 release, 500
      makePayment({ id: 'payX', milestone_id: 'ms2', amount: 300 }), // ms2 release under-recorded
      makePayment({ id: 'pay2', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([expect.objectContaining({ severity: 'critical', code: 'SETTLED_TOTAL_MISMATCH', expected: 1000, actual: 800 })]);
  });

  it('accepts a settled total where milestone_release records are stored in wei', async () => {
    seedCleanScenario();
    // Both milestones settled, release records stored as wei Numbers (5e20 = 500 ETH)
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'approved' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'approved' },
    ]));
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'released' },
        { id: 'ms2', amount: wei(500), status: 'released' },
      ],
      balance: wei(0), // both milestones settled — balance conserves the total
    }));
    mockFindByContractId.mockResolvedValue([
      makePayment({ amount: 5e20 }), // wei for ms1
      makePayment({ id: 'pay2', milestone_id: 'ms2', amount: 5e20 }), // wei for ms2
      makePayment({ id: 'pay3', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([]);
  });

  it('accepts a settled total where milestone_release records are stored in ETH units', async () => {
    seedCleanScenario();
    mockGetProjectById.mockResolvedValue(makeProject([
      { id: 'ms1', title: 'M1', amount: 500, status: 'approved' },
      { id: 'ms2', title: 'M2', amount: 500, status: 'approved' },
    ]));
    mockGetEscrowState.mockResolvedValue(makeEscrow({
      milestones: [
        { id: 'ms1', amount: wei(500), status: 'released' },
        { id: 'ms2', amount: wei(500), status: 'released' },
      ],
      balance: wei(0), // both milestones settled — balance conserves the total
    }));
    mockFindByContractId.mockResolvedValue([
      makePayment({ amount: 500 }),
      makePayment({ id: 'pay2', milestone_id: 'ms2', amount: 500 }),
      makePayment({ id: 'pay3', payment_type: 'escrow_deposit', milestone_id: null, amount: 1000, tx_hash: '0xdep' }),
    ]);
    const result = await service.reconcileContractPayments();
    expect(result.issues).toEqual([]);
  });

  it('logs a summary error with the issue count when divergences are found', async () => {
    seedCleanScenario();
    mockFindByContractId.mockResolvedValue([makePayment()]); // no deposit
    await service.reconcileContractPayments();
    expect(mockLogger.warn).toHaveBeenCalledWith('Escrow reconciliation issue', expect.objectContaining({ code: 'DEPOSIT_MISSING' }));
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Escrow reconciliation found 1 issue(s) across 1 contract(s)',
      expect.objectContaining({ criticalCount: 0 })
    );
  });

  it('counts critical issues in the summary', async () => {
    seedCleanScenario();
    // balance (499) + settled (500) conserves the (wrong) total 999 — single finding
    mockGetEscrowState.mockResolvedValue(makeEscrow({ totalAmount: wei(999), balance: wei(499) }));
    await service.reconcileContractPayments();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Escrow reconciliation found 1 issue(s) across 1 contract(s)',
      expect.objectContaining({ criticalCount: 1 })
    );
    expect(mockLogger.error).toHaveBeenCalledWith('Escrow reconciliation issue', expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
  });
});

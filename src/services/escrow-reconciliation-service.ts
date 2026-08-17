/**
 * Escrow Reconciliation Service
 *
 * Scheduled job that reconciles the DB read model against the escrow ledger for
 * every contract with a deployed escrow. It verifies:
 *
 *   (a) the escrow ledger agrees with the contract/project read model —
 *       total amount, milestone amounts, and milestone settled status
 *       (ledger 'released' ⟺ DB 'approved', ledger 'refunded' ⟺ DB 'refunded');
 *   (b) every settled milestone is fully accounted for in the payments log —
 *       an escrow_deposit record exists and matches the contract total, and the
 *       sum of release/refund/dispute_resolution records matches the sum of
 *       approved/refunded milestone amounts.
 *
 * The job is read-only: it never writes state, it only reports divergences via
 * structured error/warn logs (critical issues → error level, trace gaps →
 * warn level) so operators or a downstream alert can act. The escrow ledger is
 * the same Appwrite-backed read model in simulated and real blockchain modes,
 * so the job is valid in both.
 */

import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { logger } from '../config/logger.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository, type ProjectEntity } from '../repositories/project-repository.js';
import { paymentRepository } from '../repositories/payment-repository.js';
import { getEscrowState } from './escrow-contract.js';
import { toEthUnits } from '../utils/index.js';
import { parseUnits } from 'ethers';

const ESCROW_COLLECTION = 'blockchain_escrows';
const DEPOSIT_AMOUNT_TOLERANCE = 0.01;
/**
 * dispute_resolution records round each party's share to 2dp, so the sum of the
 * two legs can differ from the full milestone amount by up to ~0.015 — allow a
 * slightly larger tolerance for the settled-total comparison.
 */
const SETTLED_TOTAL_TOLERANCE = 0.05;

const SETTLED_DB_STATUSES = new Set(['approved', 'refunded']);
const SETTLED_RECORD_TYPES = new Set(['milestone_release', 'refund', 'dispute_resolution']);

export type ReconciliationIssue = {
  severity: 'critical' | 'warning';
  code: string;
  contractId: string;
  milestoneId: string | null;
  message: string;
  expected?: unknown;
  actual?: unknown;
};

export type ReconciliationResult = {
  checkedContracts: number;
  issues: ReconciliationIssue[];
};

type PaymentRecord = Awaited<ReturnType<typeof paymentRepository.findByContractId>>[number];

/** Minimal structural view of the escrow ledger state (EscrowState is private to escrow-contract). */
type LedgerState = {
  address: string;
  contractId: string;
  totalAmount: bigint;
  balance: bigint;
  milestones: Array<{ id: string; amount: bigint; status: 'pending' | 'released' | 'refunded' }>;
};

function toWei(amount: number): bigint {
  return parseUnits(amount.toString(), 18);
}

function amountDiffers(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) > tolerance;
}

/**
 * The DB status a settled ledger milestone must have. `null` means the ledger
 * milestone is still pending, so the DB milestone must not be settled.
 */
function ledgerExpectedDbStatus(ledgerStatus: string): string | null {
  if (ledgerStatus === 'released') return 'approved';
  if (ledgerStatus === 'refunded') return 'refunded';
  return null;
}

function issue(
  severity: ReconciliationIssue['severity'],
  code: string,
  contractId: string,
  details: { message: string; milestoneId?: string | null; expected?: unknown; actual?: unknown }
): ReconciliationIssue {
  return {
    severity,
    code,
    contractId,
    milestoneId: details.milestoneId ?? null,
    message: details.message,
    ...(details.expected === undefined ? {} : { expected: details.expected }),
    ...(details.actual === undefined ? {} : { actual: details.actual }),
  };
}

/**
 * Check the escrow ledger against the contract/project read model: total
 * amount, balance conservation, and per-milestone amount/status mapping.
 */
function checkLedgerReadModel(
  escrow: LedgerState,
  contract: ContractEntity,
  project: ProjectEntity
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  const expectedTotal = toWei(contract.total_amount);
  if (escrow.totalAmount !== expectedTotal) {
    issues.push(issue(
      'critical',
      'TOTAL_MISMATCH',
      contract.id,
      { message: 'Escrow ledger total does not match the contract total amount', expected: expectedTotal.toString(), actual: escrow.totalAmount.toString() }
    ));
  }

  const settledInLedger = escrow.milestones.reduce(
    (sum, m) => sum + (m.status === 'pending' ? 0n : m.amount),
    0n
  );
  if (escrow.balance + settledInLedger !== escrow.totalAmount) {
    issues.push(issue(
      'critical',
      'BALANCE_MISMATCH',
      contract.id,
      { message: 'Escrow balance plus settled milestone amounts does not equal the escrow total', expected: escrow.totalAmount.toString(), actual: (escrow.balance + settledInLedger).toString() }
    ));
  }

  const dbMilestones = new Map(project.milestones.map(m => [m.id, m]));
  const ledgerMilestoneIds = new Set(escrow.milestones.map(m => m.id));

  for (const ledgerMilestone of escrow.milestones) {
    const dbMilestone = dbMilestones.get(ledgerMilestone.id);
    if (!dbMilestone) {
      issues.push(issue(
        'critical',
        'MILESTONE_MISSING_IN_DB',
        contract.id,
        { milestoneId: ledgerMilestone.id, message: 'Milestone exists in the escrow ledger but not in the project read model' }
      ));
      continue;
    }

    if (ledgerMilestone.amount !== toWei(dbMilestone.amount)) {
      issues.push(issue(
        'critical',
        'MILESTONE_AMOUNT_MISMATCH',
        contract.id,
        { milestoneId: ledgerMilestone.id, message: 'Escrow milestone amount does not match the project milestone amount', expected: toWei(dbMilestone.amount).toString(), actual: ledgerMilestone.amount.toString() }
      ));
    }

    const expectedDbStatus = ledgerExpectedDbStatus(ledgerMilestone.status);
    if (expectedDbStatus !== null) {
      if (dbMilestone.status !== expectedDbStatus) {
        issues.push(issue(
          'critical',
          'MILESTONE_STATUS_MISMATCH',
          contract.id,
          { milestoneId: ledgerMilestone.id, message: `Escrow milestone is ${ledgerMilestone.status} in the ledger but ${dbMilestone.status} in the DB`, expected: expectedDbStatus, actual: dbMilestone.status }
        ));
      }
    } else if (SETTLED_DB_STATUSES.has(dbMilestone.status)) {
      issues.push(issue(
        'critical',
        'MILESTONE_STATUS_MISMATCH',
        contract.id,
        { milestoneId: ledgerMilestone.id, message: `Escrow milestone is pending in the ledger but ${dbMilestone.status} in the DB`, expected: 'pending', actual: dbMilestone.status }
      ));
    }
  }

  for (const dbMilestone of project.milestones) {
    if (!ledgerMilestoneIds.has(dbMilestone.id)) {
      issues.push(issue(
        'warning',
        'MILESTONE_MISSING_IN_ESCROW',
        contract.id,
        { milestoneId: dbMilestone.id, message: 'Milestone exists in the project read model but not in the escrow ledger' }
      ));
    }
  }

  return issues;
}

/**
 * Check the payments log against the DB read model: the escrow_deposit record,
 * per-milestone release/refund coverage, and the settled-total invariant.
 */
function checkPaymentsLog(
  contract: ContractEntity,
  project: ProjectEntity,
  payments: PaymentRecord[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  const deposits = payments.filter(p => p.payment_type === 'escrow_deposit');
  if (deposits.length === 0) {
    issues.push(issue(
      'warning',
      'DEPOSIT_MISSING',
      contract.id,
      { message: 'No escrow_deposit payment record for a funded contract' }
    ));
  } else if (!deposits.some(d => !amountDiffers(d.amount, contract.total_amount, DEPOSIT_AMOUNT_TOLERANCE))) {
    issues.push(issue(
      'warning',
      'DEPOSIT_AMOUNT_MISMATCH',
      contract.id,
      { message: 'escrow_deposit payment record amount does not match the contract total', expected: contract.total_amount, actual: deposits[0]?.amount }
    ));
  }

  const recordsByMilestone = new Map<string, PaymentRecord[]>();
  for (const payment of payments) {
    if (!payment.milestone_id) continue;
    const list = recordsByMilestone.get(payment.milestone_id) ?? [];
    list.push(payment);
    recordsByMilestone.set(payment.milestone_id, list);
  }

  for (const milestone of project.milestones) {
    const records = recordsByMilestone.get(milestone.id) ?? [];
    if (milestone.status === 'approved') {
      const covered = records.some(r =>
        r.payment_type === 'milestone_release' || r.payment_type === 'dispute_resolution'
      );
      if (!covered) {
        issues.push(issue(
          'warning',
          'RELEASE_RECORD_MISSING',
          contract.id,
          { milestoneId: milestone.id, message: 'Approved milestone has no milestone_release or dispute_resolution payment record' }
        ));
      }
    } else if (milestone.status === 'refunded') {
      const covered = records.some(r =>
        r.payment_type === 'refund' || r.payment_type === 'dispute_resolution'
      );
      if (!covered) {
        issues.push(issue(
          'warning',
          'REFUND_RECORD_MISSING',
          contract.id,
          { milestoneId: milestone.id, message: 'Refunded milestone has no refund or dispute_resolution payment record' }
        ));
      }
    }
  }

  const dbSettled = project.milestones
    .filter(m => SETTLED_DB_STATUSES.has(m.status))
    .reduce((sum, m) => sum + m.amount, 0);
  const recordsSettled = payments
    .filter(p => SETTLED_RECORD_TYPES.has(p.payment_type))
    .reduce((sum, p) => sum + toEthUnits(p.amount, p.payment_type), 0);
  if (amountDiffers(dbSettled, recordsSettled, SETTLED_TOTAL_TOLERANCE)) {
    issues.push(issue(
      'critical',
      'SETTLED_TOTAL_MISMATCH',
      contract.id,
      { message: 'Settled milestone amounts in the DB do not match the settled payment records', expected: dbSettled, actual: recordsSettled }
    ));
  }

  return issues;
}

/**
 * Reconcile a single contract's read model against its escrow ledger and
 * payments log. Returns the divergences found (empty when consistent).
 */
async function reconcileContract(
  escrowAddress: string,
  contractId: string
): Promise<ReconciliationIssue[]> {
  const issues: ReconciliationIssue[] = [];

  const escrow = (await getEscrowState(escrowAddress)) as LedgerState | null;
  if (!escrow) {
    issues.push(issue(
      'critical',
      'ESCROW_STATE_MISSING',
      contractId,
      { message: 'Escrow ledger record not found for an address in the escrow registry', expected: escrowAddress }
    ));
    return issues;
  }

  const contract = await contractRepository.getContractById(contractId);
  if (!contract) {
    issues.push(issue(
      'critical',
      'CONTRACT_MISSING',
      contractId,
      { message: 'Contract not found for an escrow ledger record' }
    ));
    return issues;
  }

  const project = contract.project_id
    ? await projectRepository.getProjectById(contract.project_id)
    : null;
  if (!project) {
    issues.push(issue(
      'critical',
      'PROJECT_MISSING',
      contractId,
      { message: 'Project not found for a contract with a deployed escrow' }
    ));
    return issues;
  }

  issues.push(...checkLedgerReadModel(escrow, contract, project));

  // A fetch failure is reported once and the record-level checks are skipped so
  // one failed read doesn't cascade into false deposit/record/settled alerts.
  let payments: PaymentRecord[] | null = null;
  try {
    payments = await paymentRepository.findByContractId(contractId);
  } catch (error) {
    issues.push(issue(
      'warning',
      'PAYMENTS_FETCH_FAILED',
      contractId,
      { message: 'Failed to fetch payment records for reconciliation', actual: error instanceof Error ? error.message : String(error) }
    ));
  }

  if (payments !== null) {
    issues.push(...checkPaymentsLog(contract, project, payments));
  }

  return issues;
}

/** Fetch every escrow registry entry (cursor pagination — no row truncation). */
async function fetchAllEscrowDocs(): Promise<Array<{ address: string; contractId: string }>> {
  const docs: Array<{ address: string; contractId: string }> = [];
  let lastId: string | undefined;

  while (true) {
    const queries: string[] = [Query.limit(100)];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const page = await databases.listDocuments(DATABASE_ID, ESCROW_COLLECTION, queries);
    for (const doc of page.documents) {
      const raw = doc as unknown as { address?: unknown; contract_id?: unknown };
      const address = String(raw.address ?? '');
      const contractId = String(raw.contract_id ?? '');
      if (address && contractId) {
        docs.push({ address, contractId });
      }
    }

    if (page.documents.length < 100) break;
    lastId = page.documents[page.documents.length - 1]?.$id;
    if (!lastId) break;
  }

  return docs;
}

/**
 * Reconcile all escrowed contracts against the ledger and payments log.
 * Returns the result for observability/tests; divergences are alerted via logs.
 */
export async function reconcileContractPayments(): Promise<ReconciliationResult> {
  const issues: ReconciliationIssue[] = [];
  let checkedContracts = 0;

  try {
    const escrowDocs = await fetchAllEscrowDocs();

    for (const doc of escrowDocs) {
      try {
        const contractIssues = await reconcileContract(doc.address, doc.contractId);
        checkedContracts += 1;
        issues.push(...contractIssues);
      } catch (error) {
        logger.error('Failed to reconcile escrow contract against ledger', {
          contractId: doc.contractId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error('Failed to run escrow reconciliation job', error);
  }

  for (const item of issues) {
    if (item.severity === 'critical') {
      logger.error('Escrow reconciliation issue', { ...item });
    } else {
      logger.warn('Escrow reconciliation issue', { ...item });
    }
  }

  if (issues.length > 0) {
    logger.error(
      `Escrow reconciliation found ${issues.length} issue(s) across ${checkedContracts} contract(s)`,
      { criticalCount: issues.filter(i => i.severity === 'critical').length }
    );
  }

  return { checkedContracts, issues };
}

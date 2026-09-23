import { RushUpgradeRequest, mapRushUpgradeRequestFromEntity } from '../utils/entity-mapper.js';
import { Contract, mapContractFromEntity } from '../utils/entity-mapper.js';
import { rushUpgradeRequestRepository, RushUpgradeRequestEntity } from '../repositories/rush-upgrade-request-repository.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { notificationRepository, type NotificationType } from '../repositories/notification-repository.js';
import { generateId } from '../utils/id.js';
import { logger } from '../config/logger.js';
import { parseUnits } from 'ethers';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import { paymentRepository } from '../repositories/payment-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { getBlockchainMode } from './blockchain/factory.js';
import { isWeb3Available, sendTransaction, getTransactionByHash } from './web3-client.js';

function hasMoreThanTwoDecimals(value: number): boolean {
  const decimalStr = value.toString().split('.')[1];
  return decimalStr !== undefined && decimalStr.length > 2;
}

function calculateRushFee(baseAmount: number, percentage: number): number {
  // Validate precision before calculation
  if (hasMoreThanTwoDecimals(percentage)) {
    throw new Error('Percentage must have maximum 2 decimal places');
  }
  // Use Math.round with proper scaling for precision-safe calculation
  return Math.round(baseAmount * percentage * 100) / 10000;
}

function hasDeployedEscrow(contractEntity: { escrow_address?: string | null }): boolean {
  return Boolean(contractEntity.escrow_address && contractEntity.escrow_address.trim().length > 0);
}

type RequestRushUpgradeInput = {
  contractId: string;
  proposedPercentage: number;
};

type RespondToRushUpgradeInput = {
  requestId: string;
  action: 'accept' | 'decline' | 'counter_offer';
  counterPercentage?: number;
};

type RushUpgradeWithContract = {
  request: RushUpgradeRequest;
  contract: Contract;
};

/**
 * Rush upgrades can only be agreed while no milestone has left the pre-payment
 * state (pending/in_progress). Once a milestone is submitted, approved,
 * refunded, disputed, or releasing, the rush fee can no longer be agreed — the
 * work is already underway. Fails closed when the project cannot be read (an
 * unverifiable state must not allow an upgrade).
 */
const PRE_PAYMENT_MILESTONE_STATUSES = new Set(['pending', 'in_progress']);

async function hasProgressedMilestones(projectId: string): Promise<boolean> {
  const project = await projectRepository.findProjectById(projectId);
  // A missing project has no milestones to gate on, so it cannot be harmed by
  // the upgrade; the rest of the flow already tolerates it (fallback titles).
  if (!project) return false;
  return (project.milestones ?? []).some(
    m => !PRE_PAYMENT_MILESTONE_STATUSES.has(String(m.status))
  );
}

async function sendNotificationSafe(params: {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    /* istanbul ignore next -- all callers always pass data; right branch is dead code */
    const notificationData = params.data != null ? params.data : {};
    await notificationRepository.createNotification({
      id: generateId(),
      ...params,
      data: notificationData,
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to send notification', { error, type: params.type });
  }
}

type RushFeeTransferResult =
  | { transactionHash: string }
  | { error: ReturnType<typeof errorResult> };

/**
 * Pay the accepted rush fee as a direct wallet-to-wallet transfer, outside the
 * escrow.
 *
 * The escrow was deployed and funded with the base milestone amounts, so the
 * fee can never be funded or released through it. On acceptance the fee is
 * instead transferred from the platform wallet to the freelancer's wallet
 * (real mode) — the same trust model as escrow funding, where the platform
 * wallet funds escrows on the employer's behalf. In simulated mode there is no
 * chain, so a `sim-rush-fee-*` hash is generated and the payment record below
 * is the ledger. The payment record (payment_type 'rush_fee') is written in
 * both modes as the durable, queryable counterpart of the transfer.
 *
 * By design the fee sits outside escrow: it is not dispute-protected.
 */
async function transferRushFee(params: {
  requestId: string;
  contractId: string;
  employerId: string;
  freelancerId: string;
  amount: number;
  clientTxHash?: string | undefined;
}): Promise<RushFeeTransferResult> {
  const { requestId, contractId, employerId, freelancerId, amount, clientTxHash } = params;

  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    return { error: errorResult('VALIDATION_ERROR', 'Rush fee must be a positive amount') };
  }

  const freelancer = await userRepository.getUserById(freelancerId);

  let transactionHash: string;
  if (clientTxHash) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(clientTxHash)) {
      return { error: errorResult('INVALID_TRANSACTION_HASH', 'Transaction hash must be a valid 66-character hexadecimal string') };
    }

    const existingPayment = await paymentRepository.findByTxHash(clientTxHash);
    if (existingPayment) {
      return { error: errorResult('DUPLICATE_TRANSACTION', 'This transaction has already been registered for a payment') };
    }

    if (getBlockchainMode() === 'real' && isWeb3Available()) {
      if (!freelancer?.wallet_address) {
        return { error: errorResult('MISSING_WALLET', 'Freelancer wallet address is required to verify rush fee payment') };
      }

      try {
        const tx = await getTransactionByHash(clientTxHash);
        if (!tx) {
          return { error: errorResult('TRANSACTION_NOT_FOUND', 'Transaction was not found on the blockchain') };
        }

        if (tx.status !== 'success') {
          return { error: errorResult('TRANSACTION_NOT_CONFIRMED', 'Transaction has not succeeded or is still pending on the blockchain') };
        }

        if (!tx.to || tx.to.toLowerCase() !== freelancer.wallet_address.toLowerCase()) {
          return { error: errorResult('INVALID_RECIPIENT', `Transaction recipient does not match freelancer wallet (${freelancer.wallet_address})`) };
        }

        const expectedWei = parseUnits(amount.toString(), 18);
        if (tx.value < expectedWei) {
          return { error: errorResult('INSUFFICIENT_AMOUNT', `Transaction value is less than required rush fee (${amount} ETH)`) };
        }
      } catch (err) {
        logger.error('Failed to verify on-chain rush fee transaction', { error: err, clientTxHash });
        return { error: errorResult('VERIFICATION_FAILED', 'Failed to verify transaction on the blockchain') };
      }
    }

    transactionHash = clientTxHash;
  } else if (getBlockchainMode() === 'real' && isWeb3Available()) {
    if (!freelancer?.wallet_address) {
      return { error: errorResult('MISSING_WALLET', 'Freelancer wallet address is required to pay the rush fee') };
    }
    try {
      const tx = await sendTransaction(freelancer.wallet_address, parseUnits(amount.toString(), 18));
      transactionHash = tx.hash;
      logger.info('Rush fee transferred on-chain', {
        contractId,
        requestId,
        amount,
        to: freelancer.wallet_address,
        transactionHash,
      });
    } catch (error) {
      logger.error('Failed to transfer rush fee on-chain', { error, contractId, requestId });
      return { error: errorResult('RUSH_FEE_TRANSFER_FAILED', 'Failed to transfer the rush fee on-chain') };
    }
  } else {
    // Simulated mode: no real chain — the payment record below is the ledger.
    transactionHash = `sim-rush-fee-${requestId}-${Date.now()}`;
  }

  try {
    await paymentRepository.create({
      id: generateId(),
      contract_id: contractId,
      milestone_id: null,
      payer_id: employerId,
      payee_id: freelancerId,
      amount,
      currency: 'ETH',
      tx_hash: transactionHash,
      status: 'completed',
      payment_type: 'rush_fee',
    });
  } catch (error) {
    logger.error('Failed to record rush fee payment', { error, contractId, requestId });
    return { error: errorResult('PAYMENT_RECORD_FAILED', 'Rush fee transferred but the payment record could not be saved') };
  }

  return { transactionHash };
}

type ApplyAcceptedRushFeeInput = {
  requestId: string;
  contractEntity: ContractEntity;
  agreedPercentage: number;
  respondedBy: string;
  clientTxHash?: string | undefined;
};

type ApplyAcceptedRushFeeResult =
  | { error: ReturnType<typeof errorResult> }
  | {
      updatedRequest: RushUpgradeRequest;
      updatedContract: Contract;
      rushFee: number;
      escrowDeployed: boolean;
      transactionHash?: string;
    };

/**
 * Apply an accepted rush upgrade. The settlement mechanism is chosen by whether
 * the contract escrow is already deployed (read under the lock at accept time):
 *
 * - No escrow yet (pending contract): the fee FOLDS INTO THE ESCROW at deploy.
 *   total_amount is bumped to base + fee and the milestone amounts stay at base;
 *   when the employer later funds, buildEscrowMilestones scales them to
 *   base + fee so the escrow is funded with the fee included. No transfer
 *   happens here and no payment record is written — the escrow deposit is the
 *   money movement.
 * - Escrow deployed (active contract): the fee is PAID DIRECTLY as a
 *   wallet-to-wallet transfer outside the escrow, and total_amount stays at
 *   base (the escrow still releases base amounts).
 *
 * Money moves first: a failed transfer leaves the request pending and applies
 * nothing to the contract. Milestones are never rescaled here in either mode.
 */
async function applyAcceptedRushFee(
  input: ApplyAcceptedRushFeeInput
): Promise<ApplyAcceptedRushFeeResult> {
  const { requestId, contractEntity, agreedPercentage, respondedBy, clientTxHash } = input;
  const now = new Date().toISOString();

  // Re-check milestone state under the lock (TOCTOU) BEFORE moving money: a
  // milestone may have been submitted/approved between the request and accept.
  if (await hasProgressedMilestones(contractEntity.project_id)) {
    return { error: errorResult('INVALID_STATUS', 'Rush upgrade can only be accepted before any milestone has been submitted, approved, or refunded') };
  }

  const newRushFee = calculateRushFee(contractEntity.base_amount, agreedPercentage);
  const escrowDeployed = hasDeployedEscrow(contractEntity);

  let transactionHash: string | undefined;
  if (escrowDeployed) {
    // Pay the fee first: a failed transfer must leave the request pending so
    // the accept can be retried, and must not apply the fee to the contract.
    const transferResult = await transferRushFee({
      requestId,
      contractId: contractEntity.id,
      employerId: contractEntity.employer_id,
      freelancerId: contractEntity.freelancer_id,
      amount: newRushFee,
      clientTxHash,
    });
    if ('error' in transferResult) return { error: transferResult.error };
    transactionHash = transferResult.transactionHash;
  }

  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(requestId, {
    status: 'accepted',
    responded_by: respondedBy,
    responded_at: now,
  });

  if (!updatedEntity) {
    return { error: errorResult('UPDATE_FAILED', 'Failed to update rush upgrade request') };
  }

  // total_amount is bumped only when the fee folds into the escrow at deploy.
  // With a deployed escrow it stays at base — the escrow releases base amounts
  // and the fee was settled by the direct transfer.
  const updatedContractEntity = await contractRepository.updateContract(contractEntity.id, escrowDeployed
    ? { rush_fee: newRushFee }
    : { rush_fee: newRushFee, total_amount: contractEntity.base_amount + newRushFee });

  if (!updatedContractEntity) {
    logger.error('Failed to apply rush upgrade to contract');
    return { error: errorResult('UPDATE_FAILED', 'Failed to apply rush upgrade to contract') };
  }

  return {
    updatedRequest: mapRushUpgradeRequestFromEntity(updatedEntity),
    updatedContract: mapContractFromEntity(updatedContractEntity),
    rushFee: newRushFee,
    escrowDeployed,
    ...(transactionHash !== undefined ? { transactionHash } : {}),
  };
}

export async function requestRushUpgrade(
  employerId: string,
  input: RequestRushUpgradeInput
): Promise<ServiceResult<RushUpgradeRequest>> {
  // M18: Lock per contract to prevent duplicate rush upgrade requests
  return withLock(`rush-upgrade:${input.contractId}`, async () => {
    if (input.proposedPercentage <= 0 || input.proposedPercentage > 100 || hasMoreThanTwoDecimals(input.proposedPercentage)) {
      return errorResult('VALIDATION_ERROR', 'Proposed percentage must be between 0.01 and 100');
    }

    const contractEntity = await contractRepository.getContractById(input.contractId);
    if (!contractEntity) {
      return errorResult('NOT_FOUND', 'Contract not found');
    }

  if (contractEntity.employer_id !== employerId) {
    return errorResult('UNAUTHORIZED', 'Only the employer can request a rush upgrade');
  }

  if (contractEntity.status !== 'active' && contractEntity.status !== 'pending') {
    return errorResult('INVALID_STATUS', 'Contract must be active or pending to request a rush upgrade');
  }

  if (contractEntity.rush_fee > 0) {
    return errorResult('ALREADY_RUSH', 'This contract already has a rush fee applied');
  }

  if (await hasProgressedMilestones(contractEntity.project_id)) {
    return errorResult('INVALID_STATUS', 'Rush upgrade can only be requested before any milestone has been submitted, approved, or refunded');
  }

  // Check for existing pending/counter_offered request.
  // withLock serializes concurrent requests for the same contract, making the
  // check-then-insert atomic for single-instance deployments. Multi-instance
  // deployments should add a DB unique constraint on (contract_id, status) to
  // prevent duplicates across instances.
  const existingRequest = await rushUpgradeRequestRepository.getPendingRequestByContract(input.contractId);
  if (existingRequest) {
    return errorResult('PENDING_REQUEST_EXISTS', 'A pending rush upgrade request already exists for this contract');
  }

  const requestEntity: Omit<RushUpgradeRequestEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    contract_id: input.contractId,
    requested_by: employerId,
    proposed_percentage: input.proposedPercentage,
    counter_percentage: null,
    status: 'pending',
    responded_by: null,
    responded_at: null,
  };

  const createdEntity = await rushUpgradeRequestRepository.createRequest(requestEntity);
  const created = mapRushUpgradeRequestFromEntity(createdEntity);

  const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
  await sendNotificationSafe({
    user_id: contractEntity.freelancer_id,
    type: 'rush_upgrade_requested',
    title: 'Rush Upgrade Request',
    message: `The employer has requested a rush upgrade for "${projectEntity?.title ?? 'your contract'}" with a ${input.proposedPercentage}% rush fee.`,
    data: {
      requestId: created.id,
      contractId: input.contractId,
      proposedPercentage: input.proposedPercentage,
      projectTitle: projectEntity?.title,
    },
  });

  return successResult(created);
  }); // end withLock
}

type RushUpgradeResponseContext = {
  requestEntity: RushUpgradeRequestEntity;
  contractEntity: ContractEntity;
};

type RushUpgradeResponseResult = ServiceResult<RushUpgradeRequest | RushUpgradeWithContract>;

/**
 * Load the request and verify the freelancer is allowed to respond.
 * Returns the entities or a ServiceResult error.
 */
async function validateRushUpgradeResponse(
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<{ error: RushUpgradeResponseResult } | RushUpgradeResponseContext> {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(input.requestId);
  if (!requestEntity) {
    return { error: errorResult('NOT_FOUND', 'Rush upgrade request not found') };
  }

  const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  if (!contractEntity || contractEntity.freelancer_id !== freelancerId) {
    return { error: errorResult('UNAUTHORIZED', 'Only the contract freelancer can respond to this request') };
  }

  if (requestEntity.status !== 'pending' && requestEntity.status !== 'counter_offered') {
    return { error: errorResult('INVALID_STATUS', `Cannot respond to a request with status "${requestEntity.status}"`) };
  }

  return { requestEntity, contractEntity };
}

/**
 * Accept the rush upgrade: settle the fee (fold into the escrow when none is
 * deployed yet, otherwise pay it directly), record it on the contract, and
 * notify the employer. Milestones are never rescaled.
 */
async function acceptRushUpgrade(
  context: RushUpgradeResponseContext,
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<RushUpgradeResponseResult> {
  const { requestEntity, contractEntity } = context;

  // Re-check milestone state under the lock (TOCTOU) BEFORE moving money or accepting
  if (await hasProgressedMilestones(contractEntity.project_id)) {
    return errorResult('INVALID_STATUS', 'Rush upgrade can only be accepted before any milestone has been submitted, approved, or refunded');
  }

  const agreedPercentage = requestEntity.counter_percentage ?? requestEntity.proposed_percentage;
  const newRushFee = calculateRushFee(contractEntity.base_amount, agreedPercentage);
  const escrowDeployed = hasDeployedEscrow(contractEntity);
  const now = new Date().toISOString();

  if (escrowDeployed) {
    // When the contract is already active, the freelancer accepting sets the request
    // to 'accepted', and the employer is prompted to pay the rush fee directly from MetaMask.
    const updatedEntity = await rushUpgradeRequestRepository.updateRequest(input.requestId, {
      status: 'accepted',
      responded_by: freelancerId,
      responded_at: now,
    });

    if (!updatedEntity) {
      return errorResult('UPDATE_FAILED', 'Failed to update rush upgrade request');
    }

    const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
    await sendNotificationSafe({
      user_id: contractEntity.employer_id,
      type: 'rush_upgrade_accepted',
      title: 'Rush Upgrade Accepted - Payment Required',
      message: `The freelancer has accepted the rush upgrade for "${projectEntity?.title ?? 'your contract'}". Please pay the ${newRushFee} ETH rush fee from your contract workspace to activate rush mode.`,
      data: {
        requestId: input.requestId,
        contractId: requestEntity.contract_id,
        rushFeePercentage: agreedPercentage,
        rushFee: newRushFee,
      },
    });

    return successResult({
      request: mapRushUpgradeRequestFromEntity(updatedEntity),
      contract: mapContractFromEntity(contractEntity),
    });
  }

  // Escrow not deployed yet (pending contract): fold into escrow
  const applied = await applyAcceptedRushFee({
    requestId: input.requestId,
    contractEntity,
    agreedPercentage,
    respondedBy: freelancerId,
  });
  if ('error' in applied) return applied.error;

  const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
  const data: Record<string, unknown> = {
    requestId: input.requestId,
    contractId: requestEntity.contract_id,
    rushFeePercentage: agreedPercentage,
    rushFee: applied.rushFee,
  };

  await sendNotificationSafe({
    user_id: contractEntity.employer_id,
    type: 'rush_upgrade_accepted',
    title: 'Rush Upgrade Accepted',
    message: `The freelancer has accepted the rush upgrade for "${projectEntity?.title ?? 'your contract'}". The ${applied.rushFee} ETH rush fee will be included in the escrow when funded.`,
    data,
  });

  return successResult({ request: applied.updatedRequest, contract: applied.updatedContract });
}

async function declineRushUpgrade(
  context: RushUpgradeResponseContext,
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<RushUpgradeResponseResult> {
  const { requestEntity, contractEntity } = context;
  const now = new Date().toISOString();

  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(input.requestId, {
    status: 'declined',
    responded_by: freelancerId,
    responded_at: now,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update rush upgrade request');
  }

  await sendNotificationSafe({
    user_id: contractEntity.employer_id,
    type: 'rush_upgrade_declined',
    title: 'Rush Upgrade Declined',
    message: 'The freelancer has declined the rush upgrade request.',
    data: {
      requestId: input.requestId,
      contractId: requestEntity.contract_id,
    },
  });

  return successResult(mapRushUpgradeRequestFromEntity(updatedEntity));
}

async function counterOfferRushUpgrade(
  context: RushUpgradeResponseContext,
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<RushUpgradeResponseResult> {
  const { requestEntity, contractEntity } = context;
  const now = new Date().toISOString();

  if (!input.counterPercentage || input.counterPercentage <= 0 || input.counterPercentage > 100 || hasMoreThanTwoDecimals(input.counterPercentage)) {
    return errorResult('VALIDATION_ERROR', 'Counter percentage must be between 0.01 and 100');
  }

  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(input.requestId, {
    status: 'counter_offered',
    counter_percentage: input.counterPercentage,
    responded_by: freelancerId,
    responded_at: now,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update rush upgrade request');
  }

  await sendNotificationSafe({
    user_id: contractEntity.employer_id,
    type: 'rush_upgrade_counter_offered',
    title: 'Rush Upgrade Counter-Offer',
    message: `The freelancer has counter-offered with a ${input.counterPercentage}% rush fee.`,
    data: {
      requestId: input.requestId,
      contractId: requestEntity.contract_id,
      counterPercentage: input.counterPercentage,
    },
  });

  return successResult(mapRushUpgradeRequestFromEntity(updatedEntity));
}

export async function respondToRushUpgrade(
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<RushUpgradeResponseResult> {
  const initialRequest = await rushUpgradeRequestRepository.getRequestById(input.requestId);
  if (!initialRequest) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  // M19: Serialize accept/decline/counter responses per contract — the same
  // `rush-upgrade:{contractId}` key requestRushUpgrade uses — so a concurrent
  // accept cannot double-apply the rush fee or race a counter-offer. The request
  // is re-read under the lock so the status transition is atomic.
  return withLock(`rush-upgrade:${initialRequest.contract_id}`, async () => {
    const validated = await validateRushUpgradeResponse(freelancerId, input);
    if ('error' in validated) return validated.error;

    if (input.action === 'accept') {
      return acceptRushUpgrade(validated, freelancerId, input);
    }

    if (input.action === 'decline') {
      return declineRushUpgrade(validated, freelancerId, input);
    }

    if (input.action === 'counter_offer') {
      return counterOfferRushUpgrade(validated, freelancerId, input);
    }

    return errorResult('INVALID_ACTION', 'Invalid action. Must be accept, decline, or counter_offer');
  }); // M19: end withLock
}

export async function acceptCounterOffer(
  employerId: string,
  requestId: string,
  options?: { transactionHash?: string | undefined }
): Promise<ServiceResult<RushUpgradeWithContract>> {
  const initialRequest = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!initialRequest) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  // M19: Serialize with respondToRushUpgrade (same lock key per contract). The
  // request is re-read under the lock so accept and counter-offer cannot both
  // apply the rush fee (double-apply) on the same contract.
  return withLock(`rush-upgrade:${initialRequest.contract_id}`, async () => {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!requestEntity) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  if (!contractEntity || contractEntity.employer_id !== employerId) {
    return errorResult('UNAUTHORIZED', 'Only the employer can accept a counter-offer');
  }

  if (requestEntity.status !== 'counter_offered') {
    return errorResult('INVALID_STATUS', 'Can only accept a counter-offered request');
  }

  if (!requestEntity.counter_percentage) {
    return errorResult('NO_COUNTER', 'No counter percentage found on this request');
  }

  const applied = await applyAcceptedRushFee({
    requestId,
    contractEntity,
    agreedPercentage: requestEntity.counter_percentage,
    respondedBy: employerId,
    clientTxHash: options?.transactionHash,
  });
  if ('error' in applied) return applied.error;

  const settlementNote = applied.escrowDeployed
    ? ' The fee was paid directly to the freelancer.'
    : ' The fee will be included in the escrow when it is funded.';
  const data: Record<string, unknown> = {
    requestId,
    contractId: requestEntity.contract_id,
    rushFeePercentage: requestEntity.counter_percentage,
    rushFee: applied.rushFee,
  };
  if (applied.transactionHash !== undefined) {
    data['transactionHash'] = applied.transactionHash;
  }

  await sendNotificationSafe({
    user_id: contractEntity.freelancer_id,
    type: 'rush_upgrade_accepted',
    title: 'Rush Upgrade Counter-Offer Accepted',
    message: `The employer has accepted your counter-offer of ${requestEntity.counter_percentage}% rush fee.${settlementNote}`,
    data,
  });

  return successResult({ request: applied.updatedRequest, contract: applied.updatedContract });
  }); // M19: end withLock
}

export type PayRushUpgradeFeeInput = {
  requestId: string;
  transactionHash?: string | undefined;
};

export async function payRushUpgradeFee(
  employerId: string,
  input: PayRushUpgradeFeeInput
): Promise<ServiceResult<RushUpgradeWithContract>> {
  const initialRequest = await rushUpgradeRequestRepository.getRequestById(input.requestId);
  if (!initialRequest) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  return withLock(`rush-upgrade:${initialRequest.contract_id}`, async () => {
    const requestEntity = await rushUpgradeRequestRepository.getRequestById(input.requestId);
    if (!requestEntity) {
      return errorResult('NOT_FOUND', 'Rush upgrade request not found');
    }

    const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
    if (!contractEntity || contractEntity.employer_id !== employerId) {
      return errorResult('UNAUTHORIZED', 'Only the employer can pay the rush fee');
    }

    if (requestEntity.status !== 'accepted') {
      return errorResult('INVALID_STATUS', 'Can only pay for an accepted rush upgrade request');
    }

    if (contractEntity.rush_fee > 0) {
      return errorResult('ALREADY_PAID', 'Rush fee has already been paid for this contract');
    }

    const agreedPercentage = requestEntity.counter_percentage ?? requestEntity.proposed_percentage;
    const newRushFee = calculateRushFee(contractEntity.base_amount, agreedPercentage);

    const transferResult = await transferRushFee({
      requestId: input.requestId,
      contractId: contractEntity.id,
      employerId: contractEntity.employer_id,
      freelancerId: contractEntity.freelancer_id,
      amount: newRushFee,
      clientTxHash: input.transactionHash,
    });

    if ('error' in transferResult) {
      return transferResult.error;
    }

    const updatedContractEntity = await contractRepository.updateContract(contractEntity.id, {
      rush_fee: newRushFee,
    });

    if (!updatedContractEntity) {
      return errorResult('UPDATE_FAILED', 'Failed to update contract with rush fee');
    }

    await sendNotificationSafe({
      user_id: contractEntity.freelancer_id,
      type: 'rush_upgrade_accepted',
      title: 'Rush Fee Paid',
      message: `The employer has paid the ${newRushFee} ETH rush fee for your contract.`,
      data: {
        requestId: input.requestId,
        contractId: requestEntity.contract_id,
        rushFee: newRushFee,
        transactionHash: transferResult.transactionHash,
      },
    });

    return successResult({
      request: mapRushUpgradeRequestFromEntity(requestEntity),
      contract: mapContractFromEntity(updatedContractEntity),
    });
  });
}

export async function declineCounterOffer(
  employerId: string,
  requestId: string
): Promise<ServiceResult<RushUpgradeRequest>> {
  const initialRequest = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!initialRequest) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  // M19: Serialize with acceptCounterOffer and respondToRushUpgrade (same key).
  return withLock(`rush-upgrade:${initialRequest.contract_id}`, async () => {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!requestEntity) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  if (!contractEntity || contractEntity.employer_id !== employerId) {
    return errorResult('UNAUTHORIZED', 'Only the employer can decline a counter-offer');
  }

  if (requestEntity.status !== 'counter_offered') {
    return errorResult('INVALID_STATUS', 'Can only decline a counter-offered request');
  }

  const now = new Date().toISOString();
  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(requestId, {
    status: 'declined',
    responded_at: now,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update rush upgrade request');
  }

  await sendNotificationSafe({
    user_id: contractEntity.freelancer_id,
    type: 'rush_upgrade_declined',
    title: 'Rush Upgrade Counter-Offer Declined',
    message: 'The employer has declined your counter-offer for the rush upgrade.',
    data: {
      requestId,
      contractId: requestEntity.contract_id,
    },
  });

  return successResult(mapRushUpgradeRequestFromEntity(updatedEntity));
  }); // M19: end withLock
}

export async function getRushUpgradeRequestsByContract(
  contractId: string
): Promise<ServiceResult<RushUpgradeRequest[]>> {
  const entities = await rushUpgradeRequestRepository.getRequestsByContract(contractId);
  return successResult(entities.map(mapRushUpgradeRequestFromEntity));
}

// Get rush upgrade requests for a contract after verifying the caller is a party
// (or an admin). Keeps contract authorization in the service layer (M11).
export async function getRushUpgradeRequestsForContract(
  contractId: string,
  userId: string,
  isAdmin = false
): Promise<ServiceResult<RushUpgradeRequest[]>> {
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  if (contractEntity.employer_id !== userId && contractEntity.freelancer_id !== userId && !isAdmin) {
    return errorResult('UNAUTHORIZED', 'You are not authorized to view rush upgrade requests for this contract');
  }

  const entities = await rushUpgradeRequestRepository.getRequestsByContract(contractId);
  return successResult(entities.map(mapRushUpgradeRequestFromEntity));
}

export async function getRushUpgradeRequestById(
  requestId: string
): Promise<ServiceResult<RushUpgradeRequest>> {
  const entity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }
  return successResult(mapRushUpgradeRequestFromEntity(entity));
}

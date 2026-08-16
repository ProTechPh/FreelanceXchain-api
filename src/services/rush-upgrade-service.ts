import { RushUpgradeRequest, mapRushUpgradeRequestFromEntity } from '../utils/entity-mapper.js';
import { Contract, mapContractFromEntity } from '../utils/entity-mapper.js';
import { rushUpgradeRequestRepository, RushUpgradeRequestEntity } from '../repositories/rush-upgrade-request-repository.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { notificationRepository, type NotificationType } from '../repositories/notification-repository.js';
import { generateId } from '../utils/id.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';


export type RequestRushUpgradeInput = {
  contractId: string;
  proposedPercentage: number;
};

export type RespondToRushUpgradeInput = {
  requestId: string;
  action: 'accept' | 'decline' | 'counter_offer';
  counterPercentage?: number;
};

export type RushUpgradeWithContract = {
  request: RushUpgradeRequest;
  contract: Contract;
};

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

async function applyRushFeeToMilestones(projectId: string, baseAmount: number, rushFee: number): Promise<void> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project || !project.milestones || project.milestones.length === 0) return;

  const newTotal = baseAmount + rushFee;
  const milestones = [...project.milestones];

  let allocated = 0;
  for (let i = 0; i < milestones.length - 1; i++) {
    const current = milestones[i]!;
    const newAmount = Math.round((current.amount ?? 0) * newTotal / baseAmount * 100) / 100;
    milestones[i] = {
      ...current,
      amount: newAmount,
    };
    allocated += newAmount;
  }

  const lastIndex = milestones.length - 1;
  const last = milestones[lastIndex]!;
  milestones[lastIndex] = {
    ...last,
    amount: Math.round((newTotal - allocated) * 100) / 100,
  };

  await projectRepository.updateProject(projectId, { milestones });
}

// Employer requests a rush upgrade on an active contract
export async function requestRushUpgrade(
  employerId: string,
  input: RequestRushUpgradeInput
): Promise<ServiceResult<RushUpgradeRequest>> {
  // M18: Lock per contract to prevent duplicate rush upgrade requests
  return withLock(`rush-upgrade:${input.contractId}`, async () => {
    // Validate percentage
    if (input.proposedPercentage <= 0 || input.proposedPercentage > 100) {
      return errorResult('VALIDATION_ERROR', 'Proposed percentage must be between 0.01 and 100');
    }

    // Check if contract exists and is active
    const contractEntity = await contractRepository.getContractById(input.contractId);
    if (!contractEntity) {
      return errorResult('NOT_FOUND', 'Contract not found');
    }

  if (contractEntity.employer_id !== employerId) {
    return errorResult('UNAUTHORIZED', 'Only the employer can request a rush upgrade');
  }

  if (contractEntity.status !== 'active') {
    return errorResult('INVALID_STATUS', 'Contract must be active to request a rush upgrade');
  }

  // Check if contract already has rush fee applied
  if (contractEntity.rush_fee > 0) {
    return errorResult('ALREADY_RUSH', 'This contract already has a rush fee applied');
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

  // Notify freelancer
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

  // Verify the freelancer is the one on the contract
  const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  if (!contractEntity || contractEntity.freelancer_id !== freelancerId) {
    return { error: errorResult('UNAUTHORIZED', 'Only the contract freelancer can respond to this request') };
  }

  // Check request is in a valid state for response
  if (requestEntity.status !== 'pending' && requestEntity.status !== 'counter_offered') {
    return { error: errorResult('INVALID_STATUS', `Cannot respond to a request with status "${requestEntity.status}"`) };
  }

  return { requestEntity, contractEntity };
}

/**
 * Accept the rush upgrade: update the request, apply the new fees to the
 * contract and its milestones, then notify the employer.
 */
async function acceptRushUpgrade(
  context: RushUpgradeResponseContext,
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<RushUpgradeResponseResult> {
  const { requestEntity, contractEntity } = context;
  const now = new Date().toISOString();

  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(input.requestId, {
    status: 'accepted',
    responded_by: freelancerId,
    responded_at: now,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update rush upgrade request');
  }

  // Apply rush upgrade: calculate new fees and update contract
  const agreedPercentage = requestEntity.counter_percentage ?? requestEntity.proposed_percentage;
  const newRushFee = Math.round(contractEntity.base_amount * agreedPercentage / 100 * 100) / 100;
  const newTotalAmount = contractEntity.base_amount + newRushFee;

  const updatedContractEntity = await contractRepository.updateContract(requestEntity.contract_id, {
    rush_fee: newRushFee,
    total_amount: newTotalAmount,
  });

  if (!updatedContractEntity) {
    logger.error('Failed to apply rush upgrade to contract');
    return errorResult('UPDATE_FAILED', 'Failed to apply rush upgrade to contract');
  }

  await applyRushFeeToMilestones(contractEntity.project_id, contractEntity.base_amount, newRushFee);

  const updatedContract = mapContractFromEntity(updatedContractEntity);
  const updatedRequest = mapRushUpgradeRequestFromEntity(updatedEntity);

  // Notify employer
  const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
  await sendNotificationSafe({
    user_id: contractEntity.employer_id,
    type: 'rush_upgrade_accepted',
    title: 'Rush Upgrade Accepted',
    message: `The freelancer has accepted the rush upgrade for "${projectEntity?.title ?? 'your contract'}". Rush fee: ${agreedPercentage}%.`,
    data: {
      requestId: input.requestId,
      contractId: requestEntity.contract_id,
      rushFeePercentage: agreedPercentage,
      newTotalAmount: updatedContract.totalAmount,
    },
  });

  return successResult({ request: updatedRequest, contract: updatedContract });
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

  // Notify employer
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

  if (!input.counterPercentage || input.counterPercentage <= 0 || input.counterPercentage > 100) {
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

  // Notify employer about counter-offer
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

// Freelancer responds to a rush upgrade request
export async function respondToRushUpgrade(
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<RushUpgradeResponseResult> {
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
}

// Employer accepts freelancer's counter-offer
export async function acceptCounterOffer(
  employerId: string,
  requestId: string
): Promise<ServiceResult<RushUpgradeWithContract>> {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!requestEntity) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  // Verify employer owns the contract
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

  const now = new Date().toISOString();
  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(requestId, {
    status: 'accepted',
    responded_by: employerId,
    responded_at: now,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update rush upgrade request');
  }

  // Apply rush upgrade with the counter percentage
  const newRushFee = Math.round(contractEntity.base_amount * requestEntity.counter_percentage / 100 * 100) / 100;
  const newTotalAmount = contractEntity.base_amount + newRushFee;

  const updatedContractEntity = await contractRepository.updateContract(requestEntity.contract_id, {
    rush_fee: newRushFee,
    total_amount: newTotalAmount,
  });

  if (!updatedContractEntity) {
    logger.error('Failed to apply rush upgrade to contract');
    return errorResult('UPDATE_FAILED', 'Failed to apply rush upgrade to contract');
  }

  await applyRushFeeToMilestones(contractEntity.project_id, contractEntity.base_amount, newRushFee);

  const updatedContract = mapContractFromEntity(updatedContractEntity);
  const updatedRequest = mapRushUpgradeRequestFromEntity(updatedEntity);

  // Notify freelancer
  await sendNotificationSafe({
    user_id: contractEntity.freelancer_id,
    type: 'rush_upgrade_accepted',
    title: 'Rush Upgrade Counter-Offer Accepted',
    message: `The employer has accepted your counter-offer of ${requestEntity.counter_percentage}% rush fee.`,
    data: {
      requestId,
      contractId: requestEntity.contract_id,
      rushFeePercentage: requestEntity.counter_percentage,
      newTotalAmount: updatedContract.totalAmount,
    },
  });

  return successResult({ request: updatedRequest, contract: updatedContract });
}

// Employer declines freelancer's counter-offer
export async function declineCounterOffer(
  employerId: string,
  requestId: string
): Promise<ServiceResult<RushUpgradeRequest>> {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!requestEntity) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }

  // Verify employer owns the contract
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

  // Notify freelancer
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
}

// Get rush upgrade requests for a contract
export async function getRushUpgradeRequestsByContract(
  contractId: string
): Promise<ServiceResult<RushUpgradeRequest[]>> {
  const entities = await rushUpgradeRequestRepository.getRequestsByContract(contractId);
  return successResult(entities.map(mapRushUpgradeRequestFromEntity));
}

// Get a single rush upgrade request
export async function getRushUpgradeRequestById(
  requestId: string
): Promise<ServiceResult<RushUpgradeRequest>> {
  const entity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Rush upgrade request not found');
  }
  return successResult(mapRushUpgradeRequestFromEntity(entity));
}

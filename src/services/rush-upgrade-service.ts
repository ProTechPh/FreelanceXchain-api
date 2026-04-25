import { RushUpgradeRequest, mapRushUpgradeRequestFromEntity } from '../utils/entity-mapper.js';
import { Contract, mapContractFromEntity } from '../utils/entity-mapper.js';
import { rushUpgradeRequestRepository, RushUpgradeRequestEntity } from '../repositories/rush-upgrade-request-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { generateId } from '../utils/id.js';
import { getSupabaseServiceClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';


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

// Employer requests a rush upgrade on an active contract
export async function requestRushUpgrade(
  employerId: string,
  input: RequestRushUpgradeInput
): Promise<ServiceResult<RushUpgradeRequest>> {
  // Validate percentage
  if (input.proposedPercentage <= 0 || input.proposedPercentage > 100) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Proposed percentage must be between 0.01 and 100' },
    };
  }

  // Check if contract exists and is active
  const contractEntity = await contractRepository.getContractById(input.contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  if (contractEntity.employer_id !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only the employer can request a rush upgrade' },
    };
  }

  if (contractEntity.status !== 'active') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Contract must be active to request a rush upgrade' },
    };
  }

  // Check if contract already has rush fee applied
  if (contractEntity.rush_fee > 0) {
    return {
      success: false,
      error: { code: 'ALREADY_RUSH', message: 'This contract already has a rush fee applied' },
    };
  }

  // Check for existing pending/counter_offered request
  const existingRequest = await rushUpgradeRequestRepository.getPendingRequestByContract(input.contractId);
  if (existingRequest) {
    return {
      success: false,
      error: { code: 'PENDING_REQUEST_EXISTS', message: 'A pending rush upgrade request already exists for this contract' },
    };
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
  try {
    const _freelancer = await userRepository.getUserById(contractEntity.freelancer_id);
    const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
    await notificationRepository.createNotification({
      id: generateId(),
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
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to create rush upgrade notification', { error });
  }

  return { success: true, data: created };
}

// Freelancer responds to a rush upgrade request
export async function respondToRushUpgrade(
  freelancerId: string,
  input: RespondToRushUpgradeInput
): Promise<ServiceResult<RushUpgradeRequest | RushUpgradeWithContract>> {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(input.requestId);
  if (!requestEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Rush upgrade request not found' },
    };
  }

  // Verify the freelancer is the one on the contract
  const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  if (!contractEntity || contractEntity.freelancer_id !== freelancerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only the contract freelancer can respond to this request' },
    };
  }

  // Check request is in a valid state for response
  if (requestEntity.status !== 'pending' && requestEntity.status !== 'counter_offered') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot respond to a request with status "${requestEntity.status}"` },
    };
  }

  const now = new Date().toISOString();

  if (input.action === 'accept') {
    // Accept the rush upgrade
    const updatedEntity = await rushUpgradeRequestRepository.updateRequest(input.requestId, {
      status: 'accepted',
      responded_by: freelancerId,
      responded_at: now,
    });

    if (!updatedEntity) {
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update rush upgrade request' },
      };
    }

    // Apply rush upgrade atomically
    const agreedPercentage = requestEntity.counter_percentage ?? requestEntity.proposed_percentage;
    const { error: rpcError } = await getSupabaseServiceClient()
      .rpc('apply_rush_upgrade_atomic', {
        p_contract_id: requestEntity.contract_id,
        p_rush_fee_percentage: agreedPercentage,
      });

    if (rpcError) {
      logger.error('Failed to apply rush upgrade (RPC)', { error: rpcError });
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to apply rush upgrade to contract' },
      };
    }

    // Get updated contract
    const updatedContractEntity = await contractRepository.getContractById(requestEntity.contract_id);
    const updatedContract = mapContractFromEntity(updatedContractEntity!);
    const updatedRequest = mapRushUpgradeRequestFromEntity(updatedEntity);

    // Notify employer
    try {
      const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
      await notificationRepository.createNotification({
        id: generateId(),
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
        is_read: false,
      });
    } catch (error) {
      logger.error('Failed to create rush upgrade accepted notification', { error });
    }

    return {
      success: true,
      data: { request: updatedRequest, contract: updatedContract } as RushUpgradeWithContract,
    };
  }

  if (input.action === 'decline') {
    const updatedEntity = await rushUpgradeRequestRepository.updateRequest(input.requestId, {
      status: 'declined',
      responded_by: freelancerId,
      responded_at: now,
    });

    if (!updatedEntity) {
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update rush upgrade request' },
      };
    }

    // Notify employer
    try {
      await notificationRepository.createNotification({
        id: generateId(),
        user_id: contractEntity.employer_id,
        type: 'rush_upgrade_declined',
        title: 'Rush Upgrade Declined',
        message: 'The freelancer has declined the rush upgrade request.',
        data: {
          requestId: input.requestId,
          contractId: requestEntity.contract_id,
        },
        is_read: false,
      });
    } catch (error) {
      logger.error('Failed to create rush upgrade declined notification', { error });
    }

    return { success: true, data: mapRushUpgradeRequestFromEntity(updatedEntity) };
  }

  if (input.action === 'counter_offer') {
    if (!input.counterPercentage || input.counterPercentage <= 0 || input.counterPercentage > 100) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Counter percentage must be between 0.01 and 100' },
      };
    }

    const updatedEntity = await rushUpgradeRequestRepository.updateRequest(input.requestId, {
      status: 'counter_offered',
      counter_percentage: input.counterPercentage,
      responded_by: freelancerId,
      responded_at: now,
    });

    if (!updatedEntity) {
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update rush upgrade request' },
      };
    }

    // Notify employer about counter-offer
    try {
      await notificationRepository.createNotification({
        id: generateId(),
        user_id: contractEntity.employer_id,
        type: 'rush_upgrade_counter_offered',
        title: 'Rush Upgrade Counter-Offer',
        message: `The freelancer has counter-offered with a ${input.counterPercentage}% rush fee.`,
        data: {
          requestId: input.requestId,
          contractId: requestEntity.contract_id,
          counterPercentage: input.counterPercentage,
        },
        is_read: false,
      });
    } catch (error) {
      logger.error('Failed to create rush upgrade counter-offer notification', { error });
    }

    return { success: true, data: mapRushUpgradeRequestFromEntity(updatedEntity) };
  }

  return {
    success: false,
    error: { code: 'INVALID_ACTION', message: 'Invalid action. Must be accept, decline, or counter_offer' },
  };
}

// Employer accepts freelancer's counter-offer
export async function acceptCounterOffer(
  employerId: string,
  requestId: string
): Promise<ServiceResult<RushUpgradeWithContract>> {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!requestEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Rush upgrade request not found' },
    };
  }

  // Verify employer owns the contract
  const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  if (!contractEntity || contractEntity.employer_id !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only the employer can accept a counter-offer' },
    };
  }

  if (requestEntity.status !== 'counter_offered') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Can only accept a counter-offered request' },
    };
  }

  if (!requestEntity.counter_percentage) {
    return {
      success: false,
      error: { code: 'NO_COUNTER', message: 'No counter percentage found on this request' },
    };
  }

  const now = new Date().toISOString();
  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(requestId, {
    status: 'accepted',
    responded_at: now,
  });

  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update rush upgrade request' },
    };
  }

  // Apply rush upgrade atomically with the counter percentage
  const { error: rpcError } = await getSupabaseServiceClient()
    .rpc('apply_rush_upgrade_atomic', {
      p_contract_id: requestEntity.contract_id,
      p_rush_fee_percentage: requestEntity.counter_percentage,
    });

  if (rpcError) {
    logger.error('Failed to apply rush upgrade (RPC)', { error: rpcError });
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to apply rush upgrade to contract' },
    };
  }

  // Get updated contract
  const updatedContractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  const updatedContract = mapContractFromEntity(updatedContractEntity!);
  const updatedRequest = mapRushUpgradeRequestFromEntity(updatedEntity);

  // Notify freelancer
  try {
    await notificationRepository.createNotification({
      id: generateId(),
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
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to create rush upgrade accepted notification', { error });
  }

  return {
    success: true,
    data: { request: updatedRequest, contract: updatedContract },
  };
}

// Employer declines freelancer's counter-offer
export async function declineCounterOffer(
  employerId: string,
  requestId: string
): Promise<ServiceResult<RushUpgradeRequest>> {
  const requestEntity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!requestEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Rush upgrade request not found' },
    };
  }

  // Verify employer owns the contract
  const contractEntity = await contractRepository.getContractById(requestEntity.contract_id);
  if (!contractEntity || contractEntity.employer_id !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only the employer can decline a counter-offer' },
    };
  }

  if (requestEntity.status !== 'counter_offered') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Can only decline a counter-offered request' },
    };
  }

  const now = new Date().toISOString();
  const updatedEntity = await rushUpgradeRequestRepository.updateRequest(requestId, {
    status: 'declined',
    responded_at: now,
  });

  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update rush upgrade request' },
    };
  }

  // Notify freelancer
  try {
    await notificationRepository.createNotification({
      id: generateId(),
      user_id: contractEntity.freelancer_id,
      type: 'rush_upgrade_declined',
      title: 'Rush Upgrade Counter-Offer Declined',
      message: 'The employer has declined your counter-offer for the rush upgrade.',
      data: {
        requestId,
        contractId: requestEntity.contract_id,
      },
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to create rush upgrade declined notification', { error });
  }

  return { success: true, data: mapRushUpgradeRequestFromEntity(updatedEntity) };
}

// Get rush upgrade requests for a contract
export async function getRushUpgradeRequestsByContract(
  contractId: string
): Promise<ServiceResult<RushUpgradeRequest[]>> {
  const entities = await rushUpgradeRequestRepository.getRequestsByContract(contractId);
  return { success: true, data: entities.map(mapRushUpgradeRequestFromEntity) };
}

// Get a single rush upgrade request
export async function getRushUpgradeRequestById(
  requestId: string
): Promise<ServiceResult<RushUpgradeRequest>> {
  const entity = await rushUpgradeRequestRepository.getRequestById(requestId);
  if (!entity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Rush upgrade request not found' },
    };
  }
  return { success: true, data: mapRushUpgradeRequestFromEntity(entity) };
}

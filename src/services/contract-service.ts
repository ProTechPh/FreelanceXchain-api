import { logger } from '../config/logger.js';
import { Contract, ContractStatus, mapContractFromEntity } from '../utils/entity-mapper.js';
import { contractRepository, ContractEntity } from '../repositories/contract-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/types.js';
import type { ServiceResult, ServiceError } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import { persistAuditEntry } from '../utils/admin-audit.js';

type ContractServiceResult<T> = ServiceResult<T>;


function mapPaginatedContracts(result: PaginatedResult<ContractEntity>): PaginatedResult<Contract> {
  return {
    items: result.items.map(mapContractFromEntity),
    hasMore: result.hasMore,
    total: result.total,
  };
}

export async function getContractById(contractId: string): Promise<ContractServiceResult<Contract>> {
  const entity = await contractRepository.getContractByIdWithRelations(contractId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }
  return successResult(mapContractFromEntity(entity));
}

export async function getUserContracts(
  userId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getUserContracts(userId, options);
  return successResult(mapPaginatedContracts(result));
}

export async function getContractsByFreelancer(
  freelancerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByFreelancer(freelancerId, options);
  return successResult(mapPaginatedContracts(result));
}

export async function getContractsByEmployer(
  employerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByEmployer(employerId, options);
  return successResult(mapPaginatedContracts(result));
}

export async function getContractsByProject(
  projectId: string
): Promise<ContractServiceResult<Contract[]>> {
  const entities = await contractRepository.getContractsByProject(projectId);
  return successResult(entities.map(mapContractFromEntity));
}

export async function updateContractStatus(
  contractId: string,
  status: ContractStatus,
  userId: string,
  userRole?: string,
): Promise<ContractServiceResult<Contract>> {
  const entity = await contractRepository.getContractById(contractId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  // BLF-5.1: Always enforce authorization — userId is now required
  if (entity.employer_id !== userId && entity.freelancer_id !== userId && userRole !== 'admin') {
    return errorResult('UNAUTHORIZED', 'Only contract parties can update contract status');
  }

  // BLF-5.3: Role-based transition restrictions
  const isEmployer = entity.employer_id === userId;
  const isFreelancer = entity.freelancer_id === userId;

  const validTransitions: Record<ContractStatus, { status: ContractStatus; allowedRoles: ('employer' | 'freelancer' | 'admin')[] }[]> = {
    pending: [
      { status: 'active', allowedRoles: ['employer'] },
      { status: 'cancelled', allowedRoles: ['employer', 'freelancer'] },
    ],
    active: [
      { status: 'completed', allowedRoles: ['employer'] },
      { status: 'disputed', allowedRoles: ['employer', 'freelancer'] },
      { status: 'cancelled', allowedRoles: ['employer'] },
    ],
    disputed: [
      { status: 'resolved', allowedRoles: ['admin'] },
      { status: 'cancelled', allowedRoles: ['admin'] },
    ],
    completed: [],
    cancelled: [],
    resolved: [
      { status: 'active', allowedRoles: ['admin'] },
      { status: 'completed', allowedRoles: ['employer'] },
      { status: 'cancelled', allowedRoles: ['admin'] },
    ],
  };

  const allowed = validTransitions[entity.status];
  const transition = allowed.find(t => t.status === status);
  if (!transition) {
    return errorResult('INVALID_STATUS_TRANSITION', `Cannot transition from "${entity.status}" to "${status}"`);
  }

  const callerRole = isEmployer ? 'employer' : isFreelancer ? 'freelancer' : userRole;
  if (!transition.allowedRoles.includes(callerRole as 'employer' | 'freelancer' | 'admin')) {
    return errorResult('UNAUTHORIZED', `Only ${transition.allowedRoles.join(' or ')} can perform this transition`);
  }

  // Extra check: disputed→resolved requires no open disputes
  if (entity.status === 'disputed' && status === 'resolved') {
    const openDisputes = await disputeRepository.getDisputesByContract(contractId);
    const hasOpenDisputes = openDisputes.items.some(d => d.status === 'open' || d.status === 'under_review');
    if (hasOpenDisputes) {
      return errorResult('OPEN_DISPUTES_EXIST', 'Cannot resolve contract while open disputes exist');
    }
  }

  const updated = await contractRepository.updateContract(contractId, { status });
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to update contract status');
  }

  return successResult(mapContractFromEntity(updated));
}

export async function setEscrowAddress(
  contractId: string,
  escrowAddress: string,
  userId: string,
): Promise<ContractServiceResult<Contract>> {
  const entity = await contractRepository.getContractById(contractId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  // H3: Only allow setting escrow on pending contracts by contract parties
  if (entity.status !== 'pending') {
    return errorResult('INVALID_STATUS', `Cannot set escrow address on a ${entity.status} contract`);
  }

  // BLF-5.2: Always enforce authorization — userId is now required
  if (entity.employer_id !== userId && entity.freelancer_id !== userId) {
    return errorResult('UNAUTHORIZED', 'Only contract parties can set escrow address');
  }

  const updated = await contractRepository.updateContract(contractId, { escrow_address: escrowAddress });
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to set escrow address');
  }

  return successResult(mapContractFromEntity(updated));
}

export async function getContractByProposalId(
  proposalId: string
): Promise<ContractServiceResult<Contract>> {
  const entity = await contractRepository.findContractByProposalId(proposalId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Contract not found for this proposal');
  }
  return successResult(mapContractFromEntity(entity));
}

/**
 * Cancel a pending contract
 * Only allowed for contracts that haven't been funded yet (status = 'pending')
 */
export async function cancelPendingContract(contractId: string, userId: string): Promise<{ success: boolean; error?: ServiceError }> {
  // BLF-5.4: Serialize concurrent cancel requests to prevent duplicate side effects
  return withLock(`contract-cancel:${contractId}`, async () => {
  const contract = await contractRepository.getContractById(contractId);
  
  if (!contract) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  if (contract.status !== 'pending') {
    return errorResult('INVALID_STATUS', `Only pending contracts can be cancelled. Current status: ${contract.status}`);
  }

  if (contract.employer_id !== userId && contract.freelancer_id !== userId) {
    return errorResult('UNAUTHORIZED', 'Only the employer or freelancer can cancel this contract');
  }

  // Update contract status to cancelled
  const updated = await contractRepository.updateContract(contractId, { status: 'cancelled' });

  if (!updated) {
    logger.error('Failed to cancel pending contract');
    return errorResult('UPDATE_FAILED', 'Failed to cancel contract');
  }

  // BLF-12.2: durable audit trail — contract cancellations are recorded with the
  // cancelling party as actor and the other contract party as target user.
  // Best-effort by design (a failed audit write never breaks the cancellation).
  const otherPartyId = contract.freelancer_id === userId ? contract.employer_id : contract.freelancer_id;
  await persistAuditEntry({
    user_id: otherPartyId,
    actor_id: userId,
    action: 'contract.cancelled',
    resource_type: 'contract',
    resource_id: contractId,
    payload: {
      projectId: contract.project_id,
      totalAmount: contract.total_amount ?? null,
    },
    ip_address: null,
    user_agent: null,
    status: 'success',
    error_message: null,
  });

  return { success: true };
  }); // BLF-5.4: end withLock
}

/**
 * Get wallet addresses for contract parties
 * Used for blockchain escrow deployment
 */
export async function getContractWalletAddresses(
  contractId: string
): Promise<ContractServiceResult<{ employerWallet: string; freelancerWallet: string }>> {
  const entity = await contractRepository.getContractById(contractId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  const [employer, freelancer] = await Promise.all([
    userRepository.getUserById(entity.employer_id),
    userRepository.getUserById(entity.freelancer_id),
  ]);

  if (!employer?.wallet_address || !freelancer?.wallet_address) {
    return errorResult('MISSING_WALLET', 'Both employer and freelancer must have wallet addresses configured');
  }

  return successResult({
    employerWallet: employer.wallet_address,
    freelancerWallet: freelancer.wallet_address,
  });
  }

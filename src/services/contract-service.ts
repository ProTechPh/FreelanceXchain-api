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
import { CONTRACT_TRANSITIONS, UNFUNDED_STATUSES } from './contract-state-machine.js';
import { readContractMilestones, usesContractMilestones } from './contract-milestone-store.js';

type ContractServiceResult<T> = ServiceResult<T>;


function mapPaginatedContracts(result: PaginatedResult<ContractEntity>): PaginatedResult<Contract> {
  return {
    items: result.items.map(mapContractFromEntity),
    hasMore: result.hasMore,
    total: result.total,
  };
}

/**
 * Populate project details (title, description, deadline, milestones) on contract entities
 * so list views show project titles and milestone counts accurately.
 * Deduplicates project IDs across contracts to avoid redundant network round-trips.
 */
async function withProjectMilestones(entities: ContractEntity[]): Promise<ContractEntity[]> {
  if (entities.length === 0) return entities;
  const { projectRepository } = await import('../repositories/project-repository.js');
  const { userRepository } = await import('../repositories/user-repository.js');
  const uniqueProjectIds = [...new Set(entities.map(e => e.project_id).filter(Boolean))];
  const uniqueUserIds = [...new Set([
    ...entities.map(e => e.freelancer_id).filter(Boolean),
    ...entities.map(e => e.employer_id).filter(Boolean),
  ])];

  const projectMap = new Map<string, any>();
  const userMap = new Map<string, any>();

  await Promise.all([
    Promise.all(
      uniqueProjectIds.map(async (projectId) => {
        try {
          const project = await projectRepository.findProjectById(projectId);
          if (project) {
            projectMap.set(projectId, project);
          }
        } catch { /* ignore — leave entity unchanged */ }
      })
    ),
    (async () => {
      try {
        const users = await userRepository.getUsersByIds(uniqueUserIds);
        for (const u of users) {
          userMap.set(u.id, u);
        }
      } catch { /* ignore */ }
    })(),
  ]);

  return entities.map((entity) => {
    const project = projectMap.get(entity.project_id);
    const freelancerUser = userMap.get(entity.freelancer_id);
    const employerUser = userMap.get(entity.employer_id);
    // Negotiated contracts carry their own milestones; legacy ones share the project's.
    const sourceMilestones = usesContractMilestones(entity) ? readContractMilestones(entity) : (project?.milestones || []);

    return {
      ...entity,
      project: project ? {
        ...(entity as any).project,
        id: project.id,
        title: project.title,
        description: project.description,
        deadline: project.deadline,
        milestones: sourceMilestones.map((m: any) => entity.status === 'completed' && ['pending', 'submitted', 'in_progress'].includes(m.status) ? { ...m, status: 'completed' } : m),
      } : (entity as any).project,
      freelancer: (entity as any).freelancer || (freelancerUser ? {
        id: freelancerUser.id,
        name: freelancerUser.name || freelancerUser.full_name || 'Contractor',
        email: freelancerUser.email,
        wallet_address: freelancerUser.wallet_address,
      } : undefined),
      employer: (entity as any).employer || (employerUser ? {
        id: employerUser.id,
        name: employerUser.name || employerUser.full_name || 'Client',
        email: employerUser.email,
        wallet_address: employerUser.wallet_address,
      } : undefined),
    } as unknown as ContractEntity;
  });
}

export async function getContractById(contractId: string): Promise<ContractServiceResult<Contract>> {
  let entity = await contractRepository.getContractByIdWithRelations(contractId);
  if (!entity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }
  // Lazy funding-deadline expiry so a stale awaiting_funding never reaches the client.
  if (entity.status === 'awaiting_funding' && entity.funding_deadline) {
    const { expireIfOverdue } = await import('./contract-lifecycle-service.js');
    if (await expireIfOverdue(entity)) {
      entity = (await contractRepository.getContractByIdWithRelations(contractId)) ?? entity;
    }
  }
  // Cast to avoid exactOptionalPropertyTypes mismatch between ContractWithRelations and ContractRelations
  return successResult(mapContractFromEntity(entity as any));
}

export async function getUserContracts(
  userId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getUserContracts(userId, options);
  result.items = await withProjectMilestones(result.items);
  return successResult(mapPaginatedContracts(result));
}

export async function getContractsByFreelancer(
  freelancerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByFreelancer(freelancerId, options);
  result.items = await withProjectMilestones(result.items);
  return successResult(mapPaginatedContracts(result));
}

export async function getContractsByEmployer(
  employerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByEmployer(employerId, options);
  result.items = await withProjectMilestones(result.items);
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

  // 'system' transitions (offer accepted, signature verified, deadline expired)
  // only happen as side effects of their own endpoints, never through here.
  const allowed = CONTRACT_TRANSITIONS[entity.status] ?? [];
  const transition = allowed.find(t => t.status === status && t.allowedRoles.some(r => r !== 'system'));
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
      return errorResult('OPEN_DISPUTES_EXIST', 'This contract has open disputes that must be resolved first.');
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
 * Cancel a contract that has not been funded yet (pending, negotiating,
 * awaiting signatures or awaiting funding). Negotiation-flow contracts release
 * their project slot so the employer can hire someone else.
 */
export async function cancelPendingContract(contractId: string, userId: string): Promise<{ success: boolean; error?: ServiceError }> {
  // BLF-5.4: Serialize concurrent cancel requests to prevent duplicate side effects
  return withLock(`contract-cancel:${contractId}`, async () => {
  const contract = await contractRepository.getContractById(contractId);
  
  if (!contract) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  if (!UNFUNDED_STATUSES.includes(contract.status)) {
    return errorResult('INVALID_STATUS', `This contract can only be cancelled before it is funded. Its current status is: ${contract.status}.`);
  }

  if (contract.employer_id !== userId && contract.freelancer_id !== userId) {
    return errorResult('UNAUTHORIZED', 'Only the employer or freelancer can cancel this contract');
  }

  if (contract.status !== 'pending') {
    const { releaseContractSlot } = await import('./contract-lifecycle-service.js');
    const released = await releaseContractSlot({
      contractId,
      actorId: userId,
      actor: contract.employer_id === userId ? 'employer' : 'freelancer',
      reason: 'cancelled_by_party',
    });
    return released.success ? { success: true } : { success: false, error: released.error };
  }

  const updated = await contractRepository.updateContract(contractId, { status: 'cancelled' });

  if (!updated) {
    logger.error('Failed to cancel pending contract');
    return errorResult('UPDATE_FAILED', 'Failed to cancel contract');
  }

  // Free the slot: slots are counted from accepted proposals / live contracts.
  try {
    const { proposalRepository } = await import('../repositories/proposal-repository.js');
    await proposalRepository.updateProposal(contract.proposal_id, {
      status: contract.freelancer_id === userId ? 'withdrawn' : 'rejected',
    });
  } catch (error) {
    logger.error('Failed to release proposal after cancelling pending contract', { contractId, error });
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
    return errorResult('MISSING_WALLET', 'Both parties need a connected wallet address before this contract can proceed.');
  }

  return successResult({
    employerWallet: employer.wallet_address,
    freelancerWallet: freelancer.wallet_address,
  });
  }

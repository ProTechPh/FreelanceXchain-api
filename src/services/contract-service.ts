import { getSupabaseServiceClient } from '../config/supabase.js';
import { Contract, ContractStatus, mapContractFromEntity } from '../utils/entity-mapper.js';
import { contractRepository, ContractEntity } from '../repositories/contract-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';

export type ContractServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type ContractServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ContractServiceError };

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
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  return { success: true, data: mapContractFromEntity(entity) };
}

export async function getUserContracts(
  userId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getUserContracts(userId, options);
  return { success: true, data: mapPaginatedContracts(result) };
}

export async function getContractsByFreelancer(
  freelancerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByFreelancer(freelancerId, options);
  return { success: true, data: mapPaginatedContracts(result) };
}

export async function getContractsByEmployer(
  employerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByEmployer(employerId, options);
  return { success: true, data: mapPaginatedContracts(result) };
}

export async function getContractsByProject(
  projectId: string
): Promise<ContractServiceResult<Contract[]>> {
  const entities = await contractRepository.getContractsByProject(projectId);
  return { success: true, data: entities.map(mapContractFromEntity) };
}

export async function updateContractStatus(
  contractId: string,
  status: ContractStatus
): Promise<ContractServiceResult<Contract>> {
  const entity = await contractRepository.getContractById(contractId);
  if (!entity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  const validTransitions: Record<ContractStatus, ContractStatus[]> = {
    pending: ['active', 'cancelled'],
    active: ['completed', 'disputed', 'cancelled'],
    disputed: ['active', 'completed', 'cancelled'],  // 'active' allowed after all disputes resolved
    completed: [],
    cancelled: [],
  };

  if (!validTransitions[entity.status].includes(status)) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${entity.status}" to "${status}"`,
      },
    };
  }

  const updated = await contractRepository.updateContract(contractId, { status });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update contract status' },
    };
  }

  return { success: true, data: mapContractFromEntity(updated) };
}

export async function setEscrowAddress(
  contractId: string,
  escrowAddress: string
): Promise<ContractServiceResult<Contract>> {
  const entity = await contractRepository.getContractById(contractId);
  if (!entity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  const updated = await contractRepository.updateContract(contractId, { escrow_address: escrowAddress });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to set escrow address' },
    };
  }

  return { success: true, data: mapContractFromEntity(updated) };
}

export async function getContractByProposalId(
  proposalId: string
): Promise<ContractServiceResult<Contract>> {
  const entity = await contractRepository.findContractByProposalId(proposalId);
  if (!entity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found for this proposal' },
    };
  }
  return { success: true, data: mapContractFromEntity(entity) };
}

/**
 * Cancel a pending contract
 * Only allowed for contracts that haven't been funded yet (status = 'pending')
 */
export async function cancelPendingContract(contractId: string, userId: string): Promise<{ success: boolean; error?: any }> {
  const contract = await contractRepository.getContractById(contractId);
  
  if (!contract) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Contract not found' } };
  }

  if (contract.status !== 'pending') {
    return { 
      success: false, 
      error: { code: 'INVALID_STATUS', message: `Only pending contracts can be cancelled. Current status: ${contract.status}` } 
    };
  }

  if (contract.employer_id !== userId && contract.freelancer_id !== userId) {
    return { 
      success: false, 
      error: { code: 'UNAUTHORIZED', message: 'Only the employer or freelancer can cancel this contract' } 
    };
  }

  // RACE CONDITION FIX: Use atomic Supabase RPC to prevent cancellation while being funded
  const { data: result, error: rpcError } = await getSupabaseServiceClient()
    .rpc('cancel_pending_contract', {
      p_contract_id: contractId,
      p_user_id: userId
    });

  if (rpcError) {
    console.error('Failed to cancel pending contract (RPC):', rpcError);
    return {
      success: false,
      error: { 
        code: 'UPDATE_FAILED', 
        message: rpcError.message 
      },
    };
  }

  return { success: true };
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
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  const employer = await userRepository.getUserById(entity.employer_id);
  const freelancer = await userRepository.getUserById(entity.freelancer_id);

  if (!employer?.wallet_address || !freelancer?.wallet_address) {
    return {
      success: false,
      error: { 
        code: 'MISSING_WALLET', 
        message: 'Both employer and freelancer must have wallet addresses configured' 
      },
    };
  }

  return {
    success: true,
    data: {
      employerWallet: employer.wallet_address,
      freelancerWallet: freelancer.wallet_address,
    },
  };
}

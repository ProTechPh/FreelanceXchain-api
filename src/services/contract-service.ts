import { Contract, ContractStatus } from '../models/contract.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';

export type ContractServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type ContractServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ContractServiceError };

// Get contract by ID
export async function getContractById(contractId: string): Promise<ContractServiceResult<Contract>> {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  return { success: true, data: contract };
}

// Get contracts for a user (both as freelancer and employer)
export async function getUserContracts(
  userId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getUserContracts(userId, options);
  return { success: true, data: result };
}

// Get contracts by freelancer
export async function getContractsByFreelancer(
  freelancerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByFreelancer(freelancerId, options);
  return { success: true, data: result };
}

// Get contracts by employer
export async function getContractsByEmployer(
  employerId: string,
  options?: QueryOptions
): Promise<ContractServiceResult<PaginatedResult<Contract>>> {
  const result = await contractRepository.getContractsByEmployer(employerId, options);
  return { success: true, data: result };
}


// Get contracts by project
export async function getContractsByProject(
  projectId: string
): Promise<ContractServiceResult<Contract[]>> {
  const contracts = await contractRepository.getContractsByProject(projectId);
  return { success: true, data: contracts };
}

// Update contract status
export async function updateContractStatus(
  contractId: string,
  status: ContractStatus
): Promise<ContractServiceResult<Contract>> {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  // Validate status transitions
  const validTransitions: Record<ContractStatus, ContractStatus[]> = {
    active: ['completed', 'disputed', 'cancelled'],
    disputed: ['active', 'completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };

  if (!validTransitions[contract.status].includes(status)) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${contract.status}" to "${status}"`,
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

  return { success: true, data: updated };
}

// Set escrow address for a contract
export async function setEscrowAddress(
  contractId: string,
  escrowAddress: string
): Promise<ContractServiceResult<Contract>> {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  const updated = await contractRepository.updateContract(contractId, { escrowAddress });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to set escrow address' },
    };
  }

  return { success: true, data: updated };
}

// Get contract by proposal ID
export async function getContractByProposalId(
  proposalId: string
): Promise<ContractServiceResult<Contract>> {
  const contract = await contractRepository.findContractByProposalId(proposalId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found for this proposal' },
    };
  }
  return { success: true, data: contract };
}

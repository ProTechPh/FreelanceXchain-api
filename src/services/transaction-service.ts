import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type { PaginatedResult } from '../repositories/types.js';
import { transactionRepository } from '../repositories/transaction-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';

export interface Transaction {
  id: string;
  contract_id?: string;
  milestone_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  amount: number;
  type: string;
  status: string;
  transaction_hash?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface TransactionOptions {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface TransactionInput {
  contract_id?: string;
  milestone_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  amount: number;
  type: string;
  status: string;
  transaction_hash?: string;
  metadata?: any;
}

/**
 * Get user's transactions with filters and pagination
 */
export async function getUserTransactions(
  userId: string,
  options: TransactionOptions = {}
): Promise<ServiceResult<PaginatedResult<Transaction>>> {
  try {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const pagedResult = await transactionRepository.findByUser(userId, { limit: 1000, offset: 0 });
    let filtered = pagedResult.items;

    // Apply filters in-memory (Appwrite doesn't support complex WHERE)
    if (options.type) {
      filtered = filtered.filter(t => t.type === options.type);
    }
    if (options.status) {
      filtered = filtered.filter(t => t.status === options.status);
    }
    if (options.startDate) {
      filtered = filtered.filter(t => new Date(t.created_at) >= new Date(options.startDate!));
    }
    if (options.endDate) {
      filtered = filtered.filter(t => new Date(t.created_at) <= new Date(options.endDate!));
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        items: items as Transaction[],
        total,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getUserTransactions', { error, userId, options });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get transaction by ID
 */
export async function getTransactionById(
  transactionId: string,
  userId: string
): Promise<ServiceResult<Transaction>> {
  try {
    const transaction = await transactionRepository.getById(transactionId);

    if (!transaction) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Transaction not found',
        },
      };
    }

    // Verify ownership
    if (transaction.from_user_id !== userId && transaction.to_user_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not authorized to view this transaction',
        },
      };
    }

    return {
      success: true,
      data: transaction as Transaction,
    };
  } catch (error) {
    logger.error('Unexpected error in getTransactionById', { error, transactionId, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get transactions by contract
 */
export async function getContractTransactions(
  contractId: string,
  userId: string
): Promise<ServiceResult<Transaction[]>> {
  try {
    // Verify user is part of contract
    const contract = await contractRepository.getContractById(contractId);

    if (!contract) {
      return {
        success: false,
        error: {
          code: 'CONTRACT_NOT_FOUND',
          message: 'Contract not found',
        },
      };
    }

    if (contract.freelancer_id !== userId && contract.employer_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not authorized to view transactions for this contract',
        },
      };
    }

    const transactions = await transactionRepository.findByContract(contractId);

    return {
      success: true,
      data: transactions as Transaction[],
    };
  } catch (error) {
    logger.error('Unexpected error in getContractTransactions', { error, contractId, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Create a new transaction record
 */
export async function createTransaction(
  input: TransactionInput
): Promise<ServiceResult<Transaction>> {
  try {
    const created = await transactionRepository.create({
      contract_id: input.contract_id,
      milestone_id: input.milestone_id,
      from_user_id: input.from_user_id,
      to_user_id: input.to_user_id,
      amount: input.amount,
      type: input.type,
      status: input.status,
      transaction_hash: input.transaction_hash,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    } as any);

    return {
      success: true,
      data: created as Transaction,
    };
  } catch (error) {
    logger.error('Unexpected error in createTransaction', { error, input });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

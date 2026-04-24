import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type { PaginatedResult } from '../repositories/base-repository.js';

const supabase = getSupabaseClient();

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

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

    // Apply filters before ordering and pagination
    if (options.type) {
      query = query.eq('type', options.type);
    }
    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.startDate) {
      query = query.gte('created_at', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch user transactions', { error, userId, options });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch transactions',
        },
      };
    }

    return {
      success: true,
      data: {
        items: (data || []) as Transaction[],
        total: count || 0,
        hasMore: offset + limit < (count || 0),
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
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Transaction not found',
        },
      };
    }

    // Verify user is involved in transaction
    if (data.from_user_id !== userId && data.to_user_id !== userId) {
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
      data: data as Transaction,
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
 * Get transactions for a specific contract
 */
export async function getTransactionsByContract(
  contractId: string,
  userId: string
): Promise<ServiceResult<Transaction[]>> {
  try {
    // Verify user is party to the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('freelancer_id, employer_id')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
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
          message: 'You are not authorized to view these transactions',
        },
      };
    }

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch contract transactions', { error, contractId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch transactions',
        },
      };
    }

    return {
      success: true,
      data: (data || []) as Transaction[],
    };
  } catch (error) {
    logger.error('Unexpected error in getTransactionsByContract', { error, contractId, userId });
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
 * Record a new transaction
 */
export async function recordTransaction(data: TransactionInput): Promise<ServiceResult<Transaction>> {
  try {
    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to record transaction', { error, data });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to record transaction',
        },
      };
    }

    return {
      success: true,
      data: transaction as Transaction,
    };
  } catch (error) {
    logger.error('Unexpected error in recordTransaction', { error, data });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

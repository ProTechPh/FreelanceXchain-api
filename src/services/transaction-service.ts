import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type { PaginatedResult } from '../repositories/types.js';

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

    let query = 'SELECT * FROM transactions WHERE (from_user_id = $1 OR to_user_id = $1)';
    let countQuery = 'SELECT COUNT(*) FROM transactions WHERE (from_user_id = $1 OR to_user_id = $1)';
    const params: any[] = [userId];
    let pIndex = 2;

    // Apply filters
    if (options.type) {
      query += ` AND type = $${pIndex}`;
      countQuery += ` AND type = $${pIndex}`;
      params.push(options.type);
      pIndex++;
    }
    if (options.status) {
      query += ` AND status = $${pIndex}`;
      countQuery += ` AND status = $${pIndex}`;
      params.push(options.status);
      pIndex++;
    }
    if (options.startDate) {
      query += ` AND created_at >= $${pIndex}`;
      countQuery += ` AND created_at >= $${pIndex}`;
      params.push(options.startDate);
      pIndex++;
    }
    if (options.endDate) {
      query += ` AND created_at <= $${pIndex}`;
      countQuery += ` AND created_at <= $${pIndex}`;
      params.push(options.endDate);
      pIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${pIndex} OFFSET $${pIndex + 1}`;
    const queryParams = [...params, limit, offset];

    const [results, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].count);

    return {
      success: true,
      data: {
        items: results.rows as Transaction[],
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
    const result = await pool.query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Transaction not found',
        },
      };
    }

    const transaction = result.rows[0];

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
    const contractResult = await pool.query(
      'SELECT freelancer_id, employer_id FROM contracts WHERE id = $1',
      [contractId]
    );

    if (contractResult.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'CONTRACT_NOT_FOUND',
          message: 'Contract not found',
        },
      };
    }

    const contract = contractResult.rows[0];
    if (contract.freelancer_id !== userId && contract.employer_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not authorized to view transactions for this contract',
        },
      };
    }

    const result = await pool.query(
      'SELECT * FROM transactions WHERE contract_id = $1 ORDER BY created_at DESC',
      [contractId]
    );

    return {
      success: true,
      data: result.rows as Transaction[],
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
    const result = await pool.query(
      `INSERT INTO transactions 
       (contract_id, milestone_id, from_user_id, to_user_id, amount, type, status, transaction_hash, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        input.contract_id,
        input.milestone_id,
        input.from_user_id,
        input.to_user_id,
        input.amount,
        input.type,
        input.status,
        input.transaction_hash,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );

    return {
      success: true,
      data: result.rows[0] as Transaction,
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

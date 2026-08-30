import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import type { PaginatedResult } from '../repositories/types.js';
import { transactionRepository, type TransactionEntity } from '../repositories/transaction-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { paymentRepository } from '../repositories/payment-repository.js';

export interface Transaction {
  id: string;
  contract_id?: string | undefined;
  milestone_id?: string | undefined;
  from_user_id?: string | undefined;
  to_user_id?: string | undefined;
  amount: number;
  type: string;
  status: string;
  transaction_hash?: string | undefined;
  metadata?: unknown;
  created_at: string;
  updated_at: string;
}

interface TransactionOptions {
  page?: number | undefined;
  limit?: number | undefined;
  type?: string | undefined;
  status?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export interface TransactionInput {
  contract_id?: string | undefined;
  milestone_id?: string | undefined;
  from_user_id?: string | undefined;
  to_user_id?: string | undefined;
  amount: number;
  type: string;
  status: string;
  transaction_hash?: string | undefined;
  metadata?: unknown;
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

    const [pagedResult, pagedPayments] = await Promise.all([
      transactionRepository.findByUser(userId, { limit: Number.MAX_SAFE_INTEGER, offset: 0 }),
      paymentRepository.findByUserId(userId, { limit: Number.MAX_SAFE_INTEGER, offset: 0 }).catch(() => ({ items: [], total: 0, hasMore: false })),
    ]);

    const txList = pagedResult.items;
    let filtered: TransactionEntity[];

    if (pagedPayments.items.length > 0) {
      const existingTxIds = new Set(txList.map(t => t.id));
      const existingHashes = new Set(txList.map(t => t.transaction_hash).filter(Boolean));

      const mappedPayments: TransactionEntity[] = pagedPayments.items
        .filter(p => !existingTxIds.has(p.id) && (!p.tx_hash || !existingHashes.has(p.tx_hash)))
        .map(p => ({
          id: p.id,
          contract_id: p.contract_id,
          milestone_id: p.milestone_id || undefined,
          from_user_id: p.payer_id,
          to_user_id: p.payee_id,
          amount: p.amount,
          type: p.payment_type,
          status: p.status,
          transaction_hash: p.tx_hash || undefined,
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));

      filtered = [...txList, ...mappedPayments]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      filtered = txList;
    }

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

    return successResult({
      items,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    logger.error('Unexpected error in getUserTransactions', { error, userId, options });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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
    let transaction = await transactionRepository.getById(transactionId);

    if (!transaction) {
      const payment = await paymentRepository.getById(transactionId).catch(() => null);
      if (payment) {
        transaction = {
          id: payment.id,
          contract_id: payment.contract_id,
          milestone_id: payment.milestone_id || undefined,
          from_user_id: payment.payer_id,
          to_user_id: payment.payee_id,
          amount: payment.amount,
          type: payment.payment_type,
          status: payment.status,
          transaction_hash: payment.tx_hash || undefined,
          created_at: payment.created_at,
          updated_at: payment.updated_at,
        };
      }
    }

    if (!transaction) {
      return errorResult('NOT_FOUND', 'Transaction not found');
    }

    // Verify ownership
    if (transaction.from_user_id !== userId && transaction.to_user_id !== userId) {
      return errorResult('UNAUTHORIZED', 'You are not authorized to view this transaction');
    }

    return successResult(transaction);
  } catch (error) {
    logger.error('Unexpected error in getTransactionById', { error, transactionId, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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
      return errorResult('CONTRACT_NOT_FOUND', 'Contract not found');
    }

    if (contract.freelancer_id !== userId && contract.employer_id !== userId) {
      return errorResult('UNAUTHORIZED', 'You are not authorized to view transactions for this contract');
    }

    const [txList, paymentList] = await Promise.all([
      transactionRepository.findByContract(contractId).catch(() => []),
      paymentRepository.findByContractId(contractId).catch(() => []),
    ]);

    const existingTxIds = new Set(txList.map(t => t.id));
    const existingHashes = new Set(txList.map(t => t.transaction_hash).filter(Boolean));

    const mappedPayments: TransactionEntity[] = paymentList
      .filter(p => !existingTxIds.has(p.id) && (!p.tx_hash || !existingHashes.has(p.tx_hash)))
      .map(p => ({
        id: p.id,
        contract_id: p.contract_id,
        milestone_id: p.milestone_id || undefined,
        from_user_id: p.payer_id,
        to_user_id: p.payee_id,
        amount: p.amount,
        type: p.payment_type,
        status: p.status,
        transaction_hash: p.tx_hash || undefined,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));

    const combined = [...txList, ...mappedPayments]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return successResult(combined);
  } catch (error) {
    logger.error('Unexpected error in getContractTransactions', { error, contractId, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Create a new transaction record
 */
export async function createTransaction(
  input: TransactionInput
): Promise<ServiceResult<Transaction>> {
  try {
    if (typeof input.amount !== 'number' || !isFinite(input.amount) || input.amount <= 0) {
      return errorResult('VALIDATION_ERROR', `Invalid transaction amount: ${input.amount}`);
    }

    // Build the create payload so optional fields are only included when set
    const transactionData: Omit<TransactionEntity, 'created_at' | 'updated_at' | 'id'> = {
      amount: input.amount,
      type: input.type,
      status: input.status,
    };
    if (input.contract_id !== undefined) transactionData.contract_id = input.contract_id;
    if (input.milestone_id !== undefined) transactionData.milestone_id = input.milestone_id;
    if (input.from_user_id !== undefined) transactionData.from_user_id = input.from_user_id;
    if (input.to_user_id !== undefined) transactionData.to_user_id = input.to_user_id;
    if (input.transaction_hash !== undefined) transactionData.transaction_hash = input.transaction_hash;
    if (input.metadata) transactionData.metadata = JSON.stringify(input.metadata);

    const created = await transactionRepository.create(transactionData);

    return successResult(created);
  } catch (error) {
    logger.error('Unexpected error in createTransaction', { error, input });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

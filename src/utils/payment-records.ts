import { logger } from '../config/logger.js';
import { paymentRepository, type PaymentType } from '../repositories/payment-repository.js';
import { generateId } from './id.js';

/**
 * Persist a durable payment record for a ledger money movement (escrow deposit,
 * milestone release, refund, dispute resolution, rush fee). Every money path
 * writes one of these so the payments log matches the ledger.
 *
 * Throws on invalid amounts and on repository failure — callers decide whether
 * a failed record write fails the operation (release) or is best-effort
 * (deposit, refund, dispute resolution, where the funds already moved).
 */
export async function createPaymentRecord(params: {
  contractId: string;
  milestoneId: string | null;
  payerId: string;
  payeeId: string;
  amount: number;
  paymentType: PaymentType;
  txHash: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
}): Promise<void> {
  if (typeof params.amount !== 'number' || !isFinite(params.amount) || params.amount <= 0) {
    logger.error('Invalid payment amount rejected', { amount: params.amount, contractId: params.contractId });
    throw new Error(`Invalid payment amount: ${params.amount}`);
  }
  try {
    await paymentRepository.create({
      id: generateId(),
      contract_id: params.contractId,
      milestone_id: params.milestoneId,
      payer_id: params.payerId,
      payee_id: params.payeeId,
      amount: params.amount,
      currency: 'ETH',
      tx_hash: params.txHash,
      status: params.status,
      payment_type: params.paymentType,
    });
  } catch (error) {
    logger.error('Failed to create payment record', { error });
    throw error;
  }
}

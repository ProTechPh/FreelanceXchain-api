import { PaymentRepository, PaymentEntity, CreatePaymentInput, PaymentStatus, PaymentType } from '../repositories/payment-repository';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository';

export type RecordPaymentInput = {
  contractId: string;
  milestoneId?: string;
  payerId: string;
  payeeId: string;
  amount: number;
  currency?: string;
  txHash?: string | undefined;
  paymentType: PaymentType;
};

export type PaymentSummary = {
  userId: string;
  totalEarnings: number;
  totalSpent: number;
  pendingPayments: number;
};

async function recordPayment(input: RecordPaymentInput): Promise<PaymentEntity> {
  const paymentData: CreatePaymentInput = {
    contract_id: input.contractId,
    milestone_id: input.milestoneId ?? null,
    payer_id: input.payerId,
    payee_id: input.payeeId,
    amount: input.amount,
    currency: input.currency ?? 'ETH',
    tx_hash: input.txHash ?? null,
    status: input.txHash ? 'completed' : 'pending',
    payment_type: input.paymentType,
  };

  return PaymentRepository.create({ ...paymentData, id: crypto.randomUUID() });
}

async function updatePaymentStatus(paymentId: string, status: PaymentStatus, txHash?: string): Promise<PaymentEntity | null> {
  return PaymentRepository.updateStatus(paymentId, status, txHash);
}

async function getPaymentsByContract(contractId: string): Promise<PaymentEntity[]> {
  return PaymentRepository.findByContractId(contractId);
}

async function getUserPayments(userId: string, options?: QueryOptions): Promise<PaginatedResult<PaymentEntity>> {
  return PaymentRepository.findByUserId(userId, options);
}

async function getPaymentByTxHash(txHash: string): Promise<PaymentEntity | null> {
  return PaymentRepository.findByTxHash(txHash);
}

async function getPaymentSummary(userId: string): Promise<PaymentSummary> {
  const [totalEarnings, totalSpent, userPayments] = await Promise.all([
    PaymentRepository.getTotalEarnings(userId),
    PaymentRepository.getTotalSpent(userId),
    PaymentRepository.findByUserId(userId, { limit: 100 }),
  ]);

  const pendingPayments = userPayments.items
    .filter(p => p.status === 'pending' || p.status === 'processing')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return { userId, totalEarnings, totalSpent, pendingPayments };
}

async function recordEscrowDeposit(contractId: string, payerId: string, payeeId: string, amount: number, txHash?: string): Promise<PaymentEntity> {
  return recordPayment({
    contractId,
    payerId,
    payeeId,
    amount,
    txHash,
    paymentType: 'escrow_deposit',
  });
}

async function recordMilestoneRelease(contractId: string, milestoneId: string, payerId: string, payeeId: string, amount: number, txHash?: string): Promise<PaymentEntity> {
  return recordPayment({
    contractId,
    milestoneId,
    payerId,
    payeeId,
    amount,
    txHash,
    paymentType: 'milestone_release',
  });
}

async function recordRefund(contractId: string, payerId: string, payeeId: string, amount: number, txHash?: string): Promise<PaymentEntity> {
  return recordPayment({
    contractId,
    payerId,
    payeeId,
    amount,
    txHash,
    paymentType: 'refund',
  });
}

async function recordDisputeResolution(contractId: string, payerId: string, payeeId: string, amount: number, txHash?: string): Promise<PaymentEntity> {
  return recordPayment({
    contractId,
    payerId,
    payeeId,
    amount,
    txHash,
    paymentType: 'dispute_resolution',
  });
}

export const TransactionService = {
  recordPayment,
  updatePaymentStatus,
  getPaymentsByContract,
  getUserPayments,
  getPaymentByTxHash,
  getPaymentSummary,
  recordEscrowDeposit,
  recordMilestoneRelease,
  recordRefund,
  recordDisputeResolution,
};

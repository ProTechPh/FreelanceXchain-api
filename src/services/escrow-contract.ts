/**
 * Escrow Smart Contract Interface
 * Handles escrow deployment, deposits, milestone releases, and refunds
 * Requirements: 6.1, 6.3
 *
 * ARCHITECTURE: Uses Supabase (blockchain_escrows + blockchain_escrow_milestones)
 * for persistent storage instead of in-memory Maps.
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client.js';
import {
  EscrowParams,
  EscrowMilestone,
  EscrowDeployment,
  TransactionReceipt,
} from './blockchain-types.js';
import { getSupabaseServiceClient } from '../config/supabase.js';

// Escrow state type (same interface, now backed by DB)
type EscrowState = {
  address: string;
  contractId: string;
  employerAddress: string;
  freelancerAddress: string;
  totalAmount: bigint;
  balance: bigint;
  milestones: EscrowMilestone[];
  deployedAt: number;
  deploymentTxHash: string;
};

// DB row types
type EscrowRow = {
  address: string;
  contract_id: string;
  employer_address: string;
  freelancer_address: string;
  total_amount: string;
  balance: string;
  deployed_at: number;
  deployment_tx_hash: string;
};

type MilestoneRow = {
  id: string;
  escrow_address: string;
  amount: string;
  status: 'pending' | 'released' | 'refunded';
};

async function loadEscrow(address: string): Promise<EscrowState | null> {
  const supabase = getSupabaseServiceClient();
  const { data: escrowRow, error } = await supabase
    .from('blockchain_escrows')
    .select('*')
    .eq('address', address)
    .single();

  if (error || !escrowRow) return null;

  const { data: milestoneRows } = await supabase
    .from('blockchain_escrow_milestones')
    .select('*')
    .eq('escrow_address', address);

  const row = escrowRow as EscrowRow;
  return {
    address: row.address,
    contractId: row.contract_id,
    employerAddress: row.employer_address,
    freelancerAddress: row.freelancer_address,
    totalAmount: BigInt(row.total_amount),
    balance: BigInt(row.balance),
    milestones: (milestoneRows as MilestoneRow[] ?? []).map(m => ({
      id: m.id,
      amount: BigInt(m.amount),
      status: m.status,
    })),
    deployedAt: row.deployed_at,
    deploymentTxHash: row.deployment_tx_hash,
  };
}

async function saveEscrow(escrow: EscrowState): Promise<void> {
  const supabase = getSupabaseServiceClient();
  await supabase
    .from('blockchain_escrows')
    .upsert({
      address: escrow.address,
      contract_id: escrow.contractId,
      employer_address: escrow.employerAddress,
      freelancer_address: escrow.freelancerAddress,
      total_amount: escrow.totalAmount.toString(),
      balance: escrow.balance.toString(),
      deployed_at: escrow.deployedAt,
      deployment_tx_hash: escrow.deploymentTxHash,
      updated_at: new Date().toISOString(),
    });

  // Upsert milestones
  if (escrow.milestones.length > 0) {
    await supabase
      .from('blockchain_escrow_milestones')
      .upsert(
        escrow.milestones.map(m => ({
          id: m.id,
          escrow_address: escrow.address,
          amount: m.amount.toString(),
          status: m.status,
        }))
      );
  }
}

/**
 * Deploy a new escrow contract
 * Creates a smart contract to hold funds for a project
 */
export async function deployEscrow(params: EscrowParams): Promise<EscrowDeployment> {
  // Generate escrow contract address
  const escrowAddress = generateWalletAddress();

  // Submit deployment transaction
  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: params.employerAddress,
    to: escrowAddress,
    amount: BigInt(0), // Deployment doesn't transfer funds
    data: {
      contractId: params.contractId,
      freelancerAddress: params.freelancerAddress,
      totalAmount: params.totalAmount.toString(),
      milestoneCount: params.milestones.length,
    },
  });

  // Confirm the transaction (in production, would wait for blockchain confirmation)
  await confirmTransaction(tx.id);

  // Store escrow state in DB
  const escrowState: EscrowState = {
    address: escrowAddress,
    contractId: params.contractId,
    employerAddress: params.employerAddress,
    freelancerAddress: params.freelancerAddress,
    totalAmount: params.totalAmount,
    balance: BigInt(0),
    milestones: params.milestones.map(m => ({
      ...m,
      status: 'pending' as const,
    })),
    deployedAt: Date.now(),
    deploymentTxHash: tx.hash!,
  };

  await saveEscrow(escrowState);

  return {
    escrowAddress,
    transactionHash: tx.hash!,
    blockNumber: tx.blockNumber!,
    deployedAt: escrowState.deployedAt,
  };
}


/**
 * Deposit funds into escrow
 * Employer funds the escrow with the project budget
 */
export async function depositToEscrow(
  escrowAddress: string,
  amount: bigint,
  fromAddress: string
): Promise<TransactionReceipt> {
  const escrow = await loadEscrow(escrowAddress);
  if (!escrow) {
    throw new Error('Escrow contract not found');
  }

  if (fromAddress !== escrow.employerAddress) {
    throw new Error('Only employer can deposit to escrow');
  }

  // Submit deposit transaction
  const tx = await submitTransaction({
    type: 'escrow_deposit',
    from: fromAddress,
    to: escrowAddress,
    amount,
    data: {
      contractId: escrow.contractId,
    },
  });

  // Confirm the transaction
  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) {
    throw new Error('Failed to confirm deposit transaction');
  }

  // Update escrow balance in DB
  escrow.balance += amount;
  await saveEscrow(escrow);

  return {
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
    status: 'success',
    gasUsed: confirmed.gasUsed!,
    timestamp: Date.now(),
  };
}

/**
 * Release milestone payment to freelancer
 * Called when employer approves milestone completion
 */
export async function releaseMilestone(
  escrowAddress: string,
  milestoneId: string,
  approverAddress: string
): Promise<TransactionReceipt> {
  const escrow = await loadEscrow(escrowAddress);
  if (!escrow) {
    throw new Error('Escrow contract not found');
  }

  if (approverAddress !== escrow.employerAddress) {
    throw new Error('Only employer can release milestone payments');
  }

  const milestone = escrow.milestones.find(m => m.id === milestoneId);
  if (!milestone) {
    throw new Error('Milestone not found');
  }

  if (milestone.status === 'released') {
    throw new Error('Milestone already released');
  }

  if (milestone.status === 'refunded') {
    throw new Error('Milestone was refunded');
  }

  if (escrow.balance < milestone.amount) {
    throw new Error('Insufficient escrow balance');
  }

  // Submit release transaction
  const tx = await submitTransaction({
    type: 'milestone_release',
    from: escrowAddress,
    to: escrow.freelancerAddress,
    amount: milestone.amount,
    data: {
      contractId: escrow.contractId,
      milestoneId,
    },
  });

  // Confirm the transaction
  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) {
    throw new Error('Failed to confirm release transaction');
  }

  // Update escrow state in DB
  milestone.status = 'released';
  escrow.balance -= milestone.amount;
  await saveEscrow(escrow);

  return {
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
    status: 'success',
    gasUsed: confirmed.gasUsed!,
    timestamp: Date.now(),
  };
}


/**
 * Refund milestone payment to employer
 * Called when dispute is resolved in employer's favor
 */
export async function refundMilestone(
  escrowAddress: string,
  milestoneId: string,
  resolverAddress: string
): Promise<TransactionReceipt> {
  const escrow = await loadEscrow(escrowAddress);
  if (!escrow) {
    throw new Error('Escrow contract not found');
  }

  // Authorization: only employer or designated resolver can trigger refund
  if (resolverAddress !== escrow.employerAddress) {
    throw new Error('Only the employer or authorized resolver can refund a milestone');
  }

  const milestone = escrow.milestones.find(m => m.id === milestoneId);
  if (!milestone) {
    throw new Error('Milestone not found');
  }

  if (milestone.status === 'released') {
    throw new Error('Milestone already released');
  }

  if (milestone.status === 'refunded') {
    throw new Error('Milestone already refunded');
  }

  if (escrow.balance < milestone.amount) {
    throw new Error('Insufficient escrow balance');
  }

  // Submit refund transaction
  const tx = await submitTransaction({
    type: 'refund',
    from: escrowAddress,
    to: escrow.employerAddress,
    amount: milestone.amount,
    data: {
      contractId: escrow.contractId,
      milestoneId,
      resolverAddress,
    },
  });

  // Confirm the transaction
  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) {
    throw new Error('Failed to confirm refund transaction');
  }

  // Update escrow state in DB
  milestone.status = 'refunded';
  escrow.balance -= milestone.amount;
  await saveEscrow(escrow);

  return {
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
    status: 'success',
    gasUsed: confirmed.gasUsed!,
    timestamp: Date.now(),
  };
}

/**
 * Get escrow balance
 */
export async function getEscrowBalance(escrowAddress: string): Promise<bigint> {
  const escrow = await loadEscrow(escrowAddress);
  if (!escrow) {
    throw new Error('Escrow contract not found');
  }
  return escrow.balance;
}

/**
 * Get escrow state
 */
export async function getEscrowState(escrowAddress: string): Promise<EscrowState | null> {
  return loadEscrow(escrowAddress);
}

/**
 * Get milestone status from escrow
 */
export async function getMilestoneStatus(
  escrowAddress: string,
  milestoneId: string
): Promise<EscrowMilestone | null> {
  const escrow = await loadEscrow(escrowAddress);
  if (!escrow) {
    return null;
  }
  return escrow.milestones.find(m => m.id === milestoneId) ?? null;
}

/**
 * Check if all milestones are released
 */
export async function areAllMilestonesReleased(escrowAddress: string): Promise<boolean> {
  const escrow = await loadEscrow(escrowAddress);
  if (!escrow) {
    return false;
  }
  return escrow.milestones.every(m => m.status === 'released');
}

/**
 * Clear all escrows (for testing)
 */
export async function clearEscrows(): Promise<void> {
  const supabase = getSupabaseServiceClient();
  await supabase.from('blockchain_escrow_milestones').delete().neq('id', '');
  await supabase.from('blockchain_escrows').delete().neq('address', '');
}

/**
 * Get escrow by contract ID
 */
export async function getEscrowByContractId(contractId: string): Promise<EscrowState | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_escrows')
    .select('address')
    .eq('contract_id', contractId)
    .limit(1)
    .single();

  if (error || !data) return null;
  return loadEscrow((data as { address: string }).address);
}

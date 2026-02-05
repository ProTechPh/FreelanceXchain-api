/**
 * Escrow Smart Contract Interface
 * Handles escrow deployment, deposits, milestone releases, and refunds
 * Requirements: 6.1, 6.3
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client';
import {
  EscrowParams,
  EscrowMilestone,
  EscrowDeployment,
  TransactionReceipt,
} from './blockchain-types';

// In-memory escrow store for simulation
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

const escrowStore = new Map<string, EscrowState>();

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

  // Store escrow state
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

  escrowStore.set(escrowAddress, escrowState);

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
  const escrow = escrowStore.get(escrowAddress);
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

  // Update escrow balance
  escrow.balance += amount;
  escrowStore.set(escrowAddress, escrow);

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
  const escrow = escrowStore.get(escrowAddress);
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

  // Update escrow state
  milestone.status = 'released';
  escrow.balance -= milestone.amount;
  escrowStore.set(escrowAddress, escrow);

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
  const escrow = escrowStore.get(escrowAddress);
  if (!escrow) {
    throw new Error('Escrow contract not found');
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

  // Update escrow state
  milestone.status = 'refunded';
  escrow.balance -= milestone.amount;
  escrowStore.set(escrowAddress, escrow);

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
  const escrow = escrowStore.get(escrowAddress);
  if (!escrow) {
    throw new Error('Escrow contract not found');
  }
  return escrow.balance;
}

/**
 * Get escrow state
 */
export async function getEscrowState(escrowAddress: string): Promise<EscrowState | null> {
  return escrowStore.get(escrowAddress) ?? null;
}

/**
 * Get milestone status from escrow
 */
export async function getMilestoneStatus(
  escrowAddress: string,
  milestoneId: string
): Promise<EscrowMilestone | null> {
  const escrow = escrowStore.get(escrowAddress);
  if (!escrow) {
    return null;
  }
  return escrow.milestones.find(m => m.id === milestoneId) ?? null;
}

/**
 * Check if all milestones are released
 */
export async function areAllMilestonesReleased(escrowAddress: string): Promise<boolean> {
  const escrow = escrowStore.get(escrowAddress);
  if (!escrow) {
    return false;
  }
  return escrow.milestones.every(m => m.status === 'released');
}

/**
 * Clear all escrows (for testing)
 */
export function clearEscrows(): void {
  escrowStore.clear();
}

/**
 * Get escrow by contract ID
 */
export async function getEscrowByContractId(contractId: string): Promise<EscrowState | null> {
  for (const escrow of escrowStore.values()) {
    if (escrow.contractId === contractId) {
      return escrow;
    }
  }
  return null;
}

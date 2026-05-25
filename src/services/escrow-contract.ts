/**
 * Escrow Smart Contract Interface
 * Handles escrow deployment, deposits, milestone releases, and refunds
 *
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
import { pool } from '../config/database.js';

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
  const escrowResult = await pool.query(
    'SELECT * FROM blockchain_escrows WHERE address = $1',
    [address]
  );

  if (escrowResult.rows.length === 0) return null;

  const milestoneResult = await pool.query(
    'SELECT * FROM blockchain_escrow_milestones WHERE escrow_address = $1',
    [address]
  );

  const row = escrowResult.rows[0] as EscrowRow;
  return {
    address: row.address,
    contractId: row.contract_id,
    employerAddress: row.employer_address,
    freelancerAddress: row.freelancer_address,
    totalAmount: BigInt(row.total_amount),
    balance: BigInt(row.balance),
    milestones: (milestoneResult.rows as MilestoneRow[]).map(m => ({
      id: m.id,
      amount: BigInt(m.amount),
      status: m.status,
    })),
    deployedAt: row.deployed_at,
    deploymentTxHash: row.deployment_tx_hash,
  };
}

async function saveEscrow(escrow: EscrowState): Promise<void> {
  await pool.query(
    `INSERT INTO blockchain_escrows 
     (address, contract_id, employer_address, freelancer_address, total_amount, balance, deployed_at, deployment_tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (address) DO UPDATE SET
       balance = EXCLUDED.balance,
       updated_at = NOW()`,
    [
      escrow.address,
      escrow.contractId,
      escrow.employerAddress,
      escrow.freelancerAddress,
      escrow.totalAmount.toString(),
      escrow.balance.toString(),
      escrow.deployedAt,
      escrow.deploymentTxHash
    ]
  );

  // Save milestones
  for (const m of escrow.milestones) {
    await pool.query(
      `INSERT INTO blockchain_escrow_milestones (id, escrow_address, amount, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [m.id, escrow.address, m.amount.toString(), m.status]
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
  await pool.query('DELETE FROM blockchain_escrow_milestones');
  await pool.query('DELETE FROM blockchain_escrows');
}

/**
 * Get escrow by contract ID
 */
export async function getEscrowByContractId(contractId: string): Promise<EscrowState | null> {
  const result = await pool.query(
    'SELECT address FROM blockchain_escrows WHERE contract_id = $1',
    [contractId]
  );

  if (result.rows.length === 0) return null;
  return loadEscrow(result.rows[0].address);
}

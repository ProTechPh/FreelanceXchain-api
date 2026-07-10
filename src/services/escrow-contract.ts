/**
 * Escrow Smart Contract Interface (Appwrite-only)
 * Handles escrow deployment, deposits, milestone releases, and refunds
 * 
 * Uses Appwrite database for persistent storage.
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
import { databases, DATABASE_ID } from '../config/appwrite.js';
import { ID, Query } from '../config/appwrite.js';
import { withLock } from '../utils/async-lock.js';

// Collection IDs for escrow storage
const ESCROW_COLLECTION = 'blockchain_escrows';
const MILESTONE_COLLECTION = 'blockchain_escrow_milestones';

// Escrow state type
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

// Appwrite document types
type EscrowDoc = {
  $id: string;
  address: string;
  contract_id: string;
  employer_address: string;
  freelancer_address: string;
  total_amount: string;
  balance: string;
  deployed_at: number;
  deployment_tx_hash: string;
};

type MilestoneDoc = {
  $id: string;
  escrow_address: string;
  milestone_id: string;
  amount: string;
  status: 'pending' | 'released' | 'refunded';
};

async function loadEscrow(address: string): Promise<EscrowState | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      ESCROW_COLLECTION,
      [Query.equal('address', address), Query.limit(1)]
    );

    if (response.documents.length === 0) return null;

    const row = response.documents[0] as unknown as EscrowDoc;

    const milestoneResponse = await databases.listDocuments(
      DATABASE_ID,
      MILESTONE_COLLECTION,
      [Query.equal('escrow_address', address)]
    );

    return {
      address: row.address,
      contractId: row.contract_id,
      employerAddress: row.employer_address,
      freelancerAddress: row.freelancer_address,
      totalAmount: BigInt(row.total_amount),
      balance: BigInt(row.balance),
      milestones: (milestoneResponse.documents as unknown as MilestoneDoc[]).map(m => ({
        id: m.milestone_id,
        amount: BigInt(m.amount),
        status: m.status,
      })),
      deployedAt: row.deployed_at,
      deploymentTxHash: row.deployment_tx_hash,
    };
  } catch {
    return null;
  }
}

async function saveEscrow(escrow: EscrowState): Promise<void> {
  // Upsert escrow document
  const existing = await databases.listDocuments(
    DATABASE_ID,
    ESCROW_COLLECTION,
    [Query.equal('address', escrow.address), Query.limit(1)]
  );

  const escrowData = {
    address: escrow.address,
    contract_id: escrow.contractId,
    employer_address: escrow.employerAddress,
    freelancer_address: escrow.freelancerAddress,
    total_amount: escrow.totalAmount.toString(),
    balance: escrow.balance.toString(),
    deployed_at: escrow.deployedAt,
    deployment_tx_hash: escrow.deploymentTxHash,
  };

  if (existing.documents.length > 0) {
    const docId = existing.documents[0]?.$id;
    if (docId) {
      await databases.updateDocument(
        DATABASE_ID,
        ESCROW_COLLECTION,
        docId,
        { balance: escrow.balance.toString() }
      );
    }
  } else {
    await databases.createDocument(
      DATABASE_ID,
      ESCROW_COLLECTION,
      ID.unique(),
      escrowData
    );
  }

  // Save milestones
  for (const m of escrow.milestones) {
    const existingMilestone = await databases.listDocuments(
      DATABASE_ID,
      MILESTONE_COLLECTION,
      [Query.equal('escrow_address', escrow.address), Query.equal('milestone_id', m.id), Query.limit(1)]
    );

    const milestoneData = {
      escrow_address: escrow.address,
      milestone_id: m.id,
      amount: m.amount.toString(),
      status: m.status,
    };

    if (existingMilestone.documents.length > 0) {
      const milestoneDocId = existingMilestone.documents[0]?.$id;
      if (milestoneDocId) {
        await databases.updateDocument(
          DATABASE_ID,
          MILESTONE_COLLECTION,
          milestoneDocId,
          { status: m.status }
        );
      }
    } else {
      await databases.createDocument(
        DATABASE_ID,
        MILESTONE_COLLECTION,
        ID.unique(),
        milestoneData
      );
    }
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

  // Store escrow state in Appwrite
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
  // BLF-1.1: Serialize deposits to prevent balance desync on concurrent deposits
  return withLock(`escrow:${escrowAddress}`, async () => {
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

    // Update escrow balance in Appwrite
    escrow.balance += amount;
    await saveEscrow(escrow);

    return {
      transactionHash: confirmed.hash!,
      blockNumber: confirmed.blockNumber!,
      status: 'success',
      gasUsed: confirmed.gasUsed!,
      timestamp: Date.now(),
    };
  });
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
  // Serialize concurrent operations on the same escrow to prevent lost-update bugs
  return withLock(`escrow:${escrowAddress}`, async () => {
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

    // Update escrow state in Appwrite
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
  });
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
  // Serialize concurrent operations on the same escrow to prevent lost-update bugs
  return withLock(`escrow:${escrowAddress}`, async () => {
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

    // Update escrow state in Appwrite
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
  });
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
  const escrows = await databases.listDocuments(DATABASE_ID, ESCROW_COLLECTION);
  for (const doc of escrows.documents) {
    await databases.deleteDocument(DATABASE_ID, ESCROW_COLLECTION, doc.$id);
  }
  const milestones = await databases.listDocuments(DATABASE_ID, MILESTONE_COLLECTION);
  for (const doc of milestones.documents) {
    await databases.deleteDocument(DATABASE_ID, MILESTONE_COLLECTION, doc.$id);
  }
}

/**
 * Get escrow by contract ID
 */
export async function getEscrowByContractId(contractId: string): Promise<EscrowState | null> {
  const response = await databases.listDocuments(
    DATABASE_ID,
    ESCROW_COLLECTION,
    [Query.equal('contract_id', contractId), Query.limit(1)]
  );

  if (response.documents.length === 0) return null;
  return loadEscrow((response.documents[0] as unknown as EscrowDoc).address);
}

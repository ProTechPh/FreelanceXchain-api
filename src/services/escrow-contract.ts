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

const ESCROW_COLLECTION = 'blockchain_escrows';
const MILESTONE_COLLECTION = 'blockchain_escrow_milestones';

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

    let milestoneResponse = await databases.listDocuments(
      DATABASE_ID,
      MILESTONE_COLLECTION,
      [Query.equal('escrow_address', address)]
    );

    // Self-heal: If no milestones exist in blockchain_escrow_milestones (e.g. deployed before collection creation),
    // backfill from the project read model so the ledger state matches the contract
    if (milestoneResponse.documents.length === 0 && row.contract_id) {
      try {
        const { contractRepository } = await import('../repositories/contract-repository.js');
        const { projectRepository } = await import('../repositories/project-repository.js');
        const contract = await contractRepository.getContractById(row.contract_id);
        if (contract?.project_id) {
          const project = await projectRepository.getProjectById(contract.project_id);
          if (project?.milestones && project.milestones.length > 0) {
            const { parseUnits } = await import('ethers');
            await Promise.all(
              project.milestones.map(async (m) => {
                const status = m.status === 'approved' ? 'released' : m.status === 'refunded' ? 'refunded' : 'pending';
                await databases.createDocument(
                  DATABASE_ID,
                  MILESTONE_COLLECTION,
                  ID.unique(),
                  {
                    escrow_address: address,
                    milestone_id: m.id,
                    amount: parseUnits(m.amount.toString(), 18).toString(),
                    status,
                  }
                );
              })
            );
            milestoneResponse = await databases.listDocuments(
              DATABASE_ID,
              MILESTONE_COLLECTION,
              [Query.equal('escrow_address', address)]
            );
          }
        }
      } catch {
        // Non-critical backfill failure
      }
    }

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

  await Promise.all(escrow.milestones.map(async (m) => {
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
  }));
}

/**
 * Deploy a new escrow contract
 * Creates a smart contract to hold funds for a project
 */
export async function deployEscrow(params: EscrowParams): Promise<EscrowDeployment> {
  const escrowAddress = generateWalletAddress();

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

    const tx = await submitTransaction({
      type: 'escrow_deposit',
      from: fromAddress,
      to: escrowAddress,
      amount,
      data: {
        contractId: escrow.contractId,
      },
    });

    const confirmed = await confirmTransaction(tx.id);
    if (!confirmed) {
      throw new Error('Failed to confirm deposit transaction');
    }

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

    const confirmed = await confirmTransaction(tx.id);
    if (!confirmed) {
      throw new Error('Failed to confirm release transaction');
    }

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
/**
 * Resolve a disputed milestone with a split payout (arbiter resolution).
 *
 * Releases freelancerBps/10000 of the milestone amount to the freelancer and
 * refunds the remainder to the employer, mirroring the on-chain FreelanceEscrow
 * resolveDispute(freelancerBps) pull-payment semantics in the simulated ledger.
 * The milestone is marked 'released' (on-chain maps it to Approved) and the full
 * milestone amount is deducted from the escrow balance.
 *
 * @param freelancerBps Portion awarded to the freelancer in basis points (1-9999 for a genuine split)
 */
export async function resolveDisputeSplit(
  escrowAddress: string,
  milestoneId: string,
  freelancerBps: number,
  resolverAddress: string
): Promise<TransactionReceipt> {
  // Serialize concurrent operations on the same escrow to prevent lost-update bugs
  return withLock(`escrow:${escrowAddress}`, async () => {
    const escrow = await loadEscrow(escrowAddress);
    if (!escrow) {
      throw new Error('Escrow contract not found');
    }

    // Authorization: only employer or designated resolver can trigger resolution
    if (resolverAddress !== escrow.employerAddress) {
      throw new Error('Only the employer or authorized resolver can resolve a milestone');
    }

    if (freelancerBps <= 0 || freelancerBps >= 10000) {
      throw new Error('freelancerBps must be between 1 and 9999 for a split resolution');
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

    const freelancerAmt = (milestone.amount * BigInt(freelancerBps)) / BigInt(10000);
    const employerAmt = milestone.amount - freelancerAmt;

    const releaseTx = await submitTransaction({
      type: 'milestone_release',
      from: escrowAddress,
      to: escrow.freelancerAddress,
      amount: freelancerAmt,
      data: {
        contractId: escrow.contractId,
        milestoneId,
        split: true,
        freelancerBps,
      },
    });

    const releaseConfirmed = await confirmTransaction(releaseTx.id);
    if (!releaseConfirmed) {
      throw new Error('Failed to confirm release transaction');
    }

    const refundTx = await submitTransaction({
      type: 'refund',
      from: escrowAddress,
      to: escrow.employerAddress,
      amount: employerAmt,
      data: {
        contractId: escrow.contractId,
        milestoneId,
        split: true,
        freelancerBps,
      },
    });

    const refundConfirmed = await confirmTransaction(refundTx.id);
    if (!refundConfirmed) {
      throw new Error('Failed to confirm refund transaction');
    }

    // Update escrow state in Appwrite: milestone settled, full amount leaves escrow
    milestone.status = 'released';
    escrow.balance -= milestone.amount;
    await saveEscrow(escrow);

    return {
      transactionHash: refundConfirmed.hash!,
      blockNumber: refundConfirmed.blockNumber!,
      status: 'success',
      gasUsed: refundConfirmed.gasUsed!,
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

    const confirmed = await confirmTransaction(tx.id);
    if (!confirmed) {
      throw new Error('Failed to confirm refund transaction');
    }

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

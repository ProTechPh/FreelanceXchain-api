/**
 * Escrow Blockchain Integration
 * Real blockchain integration for escrow system using deployed smart contracts
 */

import type { Contract, ContractTransactionResponse, ContractTransactionReceipt, TransactionReceipt } from 'ethers';
import { getContractWithSigner, getContractWithArbiterSigner, getContract, isWeb3Available, getWallet } from './web3-client.js';
import { FreelanceEscrowABI, FreelanceEscrowBytecode } from './contract-abis.js';
import { ContractFactory } from 'ethers';
import { logger } from '../config/logger.js';
import type { BlockchainMilestoneStatus } from './blockchain/adapter.js';

export type EscrowMilestone = {
  amount: bigint;
  status: BlockchainMilestoneStatus;
  description: string;
};

/**
 * On-chain FreelanceEscrow.MilestoneStatus mirrored into plain names.
 * Enum values: 0=Pending, 1=Submitted, 2=Approved, 3=Disputed, 4=Refunded.
 */
export type OnChainMilestoneStatus = 'pending' | 'submitted' | 'approved' | 'disputed' | 'refunded';

const ON_CHAIN_MILESTONE_STATUS_NAMES: readonly OnChainMilestoneStatus[] = [
  'pending', 'submitted', 'approved', 'disputed', 'refunded',
];

export type EscrowDeploymentParams = {
  contractId: string;
  freelancerAddress: string;
  arbiterAddress: string;
  milestoneAmounts: bigint[];
  milestoneDescriptions: string[];
  totalAmount: bigint;
};

export type EscrowInfo = {
  employer: string;
  freelancer: string;
  arbiter: string;
  totalAmount: bigint;
  releasedAmount: bigint;
  isActive: boolean;
  contractId: string;
  balance: bigint;
};

/**
 * Deploy a new escrow contract
 */
export async function deployEscrowContract(
  params: EscrowDeploymentParams
): Promise<{ escrowAddress: string; transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured. Please set BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY');
  }

  const wallet = getWallet();
  const factory = new ContractFactory(FreelanceEscrowABI, FreelanceEscrowBytecode, wallet);

  const contract = await factory.deploy(
    params.freelancerAddress,
    params.arbiterAddress,
    wallet.address, // platform = server wallet (can approve milestones on employer's behalf)
    params.contractId,
    params.milestoneAmounts,
    params.milestoneDescriptions,
    { value: params.totalAmount }
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  if (!deployTx) {
    throw new Error('Deployment transaction not found');
  }

  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error('Failed to get deployment receipt');
  }

  return {
    escrowAddress: address,
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Typed view of the FreelanceEscrow ABI surface used by this module.
 * ethers.Contract is intentionally untyped for arbitrary ABIs, so we declare
 * the exact methods we call here instead of casting to `any` at each call site.
 */
type EscrowContract = Contract & {
  employer(): Promise<string>;
  freelancer(): Promise<string>;
  arbiter(): Promise<string>;
  totalAmount(): Promise<bigint>;
  releasedAmount(): Promise<bigint>;
  isActive(): Promise<boolean>;
  contractId(): Promise<string>;
  getBalance(): Promise<bigint>;
  getRemainingAmount(): Promise<bigint>;
  getMilestoneCount(): Promise<bigint>;
  getMilestone(index: number): Promise<[bigint, bigint, string]>;
  pendingWithdrawals(party: string): Promise<bigint>;
  submitMilestone(index: number): Promise<ContractTransactionResponse>;
  approveMilestone(index: number): Promise<ContractTransactionResponse>;
  disputeMilestone(index: number): Promise<ContractTransactionResponse>;
  resolveDispute(index: number, freelancerBps: number): Promise<ContractTransactionResponse>;
  refundMilestone(index: number): Promise<ContractTransactionResponse>;
  cancelContract(): Promise<ContractTransactionResponse>;
  withdraw(): Promise<ContractTransactionResponse>;
};

/**
 * Wait for a contract transaction to be mined and return its receipt.
 * ethers returns null when the transaction was replaced or dropped.
 */
async function waitForReceipt(tx: ContractTransactionResponse): Promise<ContractTransactionReceipt> {
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('Transaction was replaced or dropped');
  }
  return receipt;
}

/**
 * Get escrow contract instance for reading
 */
function getEscrowContract(escrowAddress: string): EscrowContract {
  return getContract(escrowAddress, FreelanceEscrowABI) as EscrowContract;
}

/**
 * Get escrow contract instance for writing
 */
function getEscrowContractWithSigner(escrowAddress: string): EscrowContract {
  return getContractWithSigner(escrowAddress, FreelanceEscrowABI) as EscrowContract;
}

/**
 * Get escrow contract instance for arbiter-only writing operations
 */
function getEscrowContractWithArbiterSigner(escrowAddress: string): EscrowContract {
  return getContractWithArbiterSigner(escrowAddress, FreelanceEscrowABI) as EscrowContract;
}

/**
 * Get escrow information
 */
export async function getEscrowInfo(escrowAddress: string): Promise<EscrowInfo> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);

  const [employer, freelancer, arbiter, totalAmount, releasedAmount, isActive, contractId, balance] = await Promise.all([
    contract.employer(),
    contract.freelancer(),
    contract.arbiter(),
    contract.totalAmount(),
    contract.releasedAmount(),
    contract.isActive(),
    contract.contractId(),
    contract.getBalance(),
  ]);

  return {
    employer,
    freelancer,
    arbiter,
    totalAmount,
    releasedAmount,
    isActive,
    contractId,
    balance,
  };
}

/**
 * Get the on-chain milestone status (mirrored to a plain string).
 */
export async function getMilestoneStatus(
  escrowAddress: string,
  milestoneIndex: number
): Promise<OnChainMilestoneStatus> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const [, status] = await getEscrowContract(escrowAddress).getMilestone(milestoneIndex);
  const name = ON_CHAIN_MILESTONE_STATUS_NAMES[Number(status)];
  if (!name) {
    throw new Error(`Unknown on-chain milestone status: ${status}`);
  }
  return name;
}

/**
 * Submit milestone for approval (freelancer)
 */
export async function submitMilestone(
  escrowAddress: string,
  milestoneIndex: number
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const receipt = await waitForReceipt(
    await getEscrowContractWithSigner(escrowAddress).submitMilestone(milestoneIndex)
  );

  return {
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Approve milestone and release payment (employer)
 */
export async function approveMilestone(
  escrowAddress: string,
  milestoneIndex: number
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const receipt = await waitForReceipt(
    await getEscrowContractWithSigner(escrowAddress).approveMilestone(milestoneIndex)
  );

  return {
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Dispute a milestone
 */
export async function disputeMilestone(
  escrowAddress: string,
  milestoneIndex: number
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const receipt = await waitForReceipt(
    await getEscrowContractWithSigner(escrowAddress).disputeMilestone(milestoneIndex)
  );

  return {
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Resolve dispute (arbiter only)
 *
 * The on-chain FreelanceEscrow contract restricts resolveDispute() to the arbiter
 * (onlyArbiter) and expresses the award as basis points: 10000 = full to the
 * freelancer, 0 = full to the employer, 5000 = 50/50 split.
 * Funds are credited to each party's pendingWithdrawals (pull-payment pattern)
 * and must be claimed via withdraw() by the party's own wallet.
 *
 * @param freelancerBps Portion of the milestone awarded to the freelancer (0-10000)
 */
export async function resolveDispute(
  escrowAddress: string,
  milestoneIndex: number,
  freelancerBps: number
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }
  if (freelancerBps < 0 || freelancerBps > 10000) {
    throw new Error('freelancerBps must be between 0 and 10000');
  }

  // 1. If 100% in favor of freelancer (10000 bps) and milestone is not in Disputed state on-chain,
  // directly approve and release payment to freelancer via the platform wallet.
  if (freelancerBps === 10000) {
    try {
      const escrow = getEscrowContract(escrowAddress);
      const onChainMilestone = await escrow.getMilestone(milestoneIndex).catch(() => null);
      if (onChainMilestone) {
        const status = Number(onChainMilestone[1]);
        if (status === 0) {
          await submitMilestone(escrowAddress, milestoneIndex);
          return await approveMilestone(escrowAddress, milestoneIndex);
        } else if (status === 1) {
          return await approveMilestone(escrowAddress, milestoneIndex);
        }
      }
    } catch (approveErr) {
      logger.warn('Direct milestone approval fallback during dispute resolution failed, proceeding to arbiter resolve', { error: approveErr });
    }
  }

  // 2. If 100% in favor of employer (0 bps) and milestone is Pending on-chain:
  if (freelancerBps === 0) {
    try {
      const escrow = getEscrowContract(escrowAddress);
      const onChainMilestone = await escrow.getMilestone(milestoneIndex).catch(() => null);
      if (onChainMilestone && Number(onChainMilestone[1]) === 0) {
        return await refundMilestone(escrowAddress, milestoneIndex);
      }
    } catch (refundErr) {
      logger.warn('Direct refund fallback during dispute resolution failed, proceeding to arbiter resolve', { error: refundErr });
    }
  }

  // 3. For disputed milestones or split resolutions, execute arbiter resolution on-chain
  try {
    const escrow = getEscrowContract(escrowAddress);
    const onChainMilestone = await escrow.getMilestone(milestoneIndex).catch(() => null);
    if (onChainMilestone && Number(onChainMilestone[1]) !== 3 && Number(onChainMilestone[1]) !== 2) {
      try {
        await disputeMilestone(escrowAddress, milestoneIndex);
      } catch (dispErr) {
        logger.warn('Could not transition milestone to Disputed on-chain', { error: dispErr });
      }
    }
  } catch (checkErr) {
    logger.warn('Could not verify on-chain status before dispute resolution', { error: checkErr });
  }

  // Requires PLATFORM_ARBITER_PRIVATE_KEY — throws a clear error if missing
  const receipt = await waitForReceipt(
    await getEscrowContractWithArbiterSigner(escrowAddress).resolveDispute(milestoneIndex, freelancerBps)
  );

  return {
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Get the amount a party can currently withdraw from the escrow (pull-payment).
 * After a dispute resolution, each party's allocation is credited to their
 * pendingWithdrawals and claimed via the contract's withdraw().
 */
export async function getPendingWithdrawals(escrowAddress: string, party: string): Promise<bigint> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);
  return contract.pendingWithdrawals(party);
}

/**
 * Withdraw the server wallet's pending allocation from the escrow.
 *
 * The server wallet is the on-chain employer/platform, so this claims the
 * employer's share after dispute resolution. Freelancer allocations must be
 * claimed by the freelancer's own wallet (msg.sender) via the escrow's withdraw().
 */
export async function withdrawFromEscrow(
  escrowAddress: string,
  recipientAddress?: string
): Promise<{ transactionHash: string; forwardTxHash?: string | undefined; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContractWithSigner(escrowAddress);
  const serverWalletAddress = await getWallet().getAddress();
  let pendingAmount = BigInt(0);
  try {
    pendingAmount = await contract.pendingWithdrawals(serverWalletAddress);
  } catch (err) {
    logger.warn('Could not query pendingWithdrawals on escrow contract', { escrowAddress, error: err });
  }

  const receipt = await waitForReceipt(
    await contract.withdraw()
  );

  let forwardTxHash: string | undefined;
  if (recipientAddress && pendingAmount > BigInt(0)) {
    try {
      const { sendTransaction } = await import('./web3-client.js');
      const forwardResult = await sendTransaction(recipientAddress, pendingAmount);
      forwardTxHash = forwardResult.hash;
      logger.info('Forwarded withdrawn escrow refund to employer wallet', {
        escrowAddress,
        recipientAddress,
        amount: pendingAmount.toString(),
        forwardTxHash,
      });
    } catch (forwardErr) {
      logger.error('Failed to forward withdrawn escrow refund to recipient address', {
        escrowAddress,
        recipientAddress,
        amount: pendingAmount.toString(),
        error: forwardErr,
      });
    }
  }

  return {
    transactionHash: receipt.hash,
    forwardTxHash,
    receipt,
  };
}

/**
 * Refund a pending milestone (employer only)
 */
export async function refundMilestone(
  escrowAddress: string,
  milestoneIndex: number
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const receipt = await waitForReceipt(
    await getEscrowContractWithSigner(escrowAddress).refundMilestone(milestoneIndex)
  );

  return {
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Cancel contract and refund remaining funds (employer only)
 */
export async function cancelContract(
  escrowAddress: string
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const receipt = await waitForReceipt(
    await getEscrowContractWithSigner(escrowAddress).cancelContract()
  );

  return {
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Get milestone details
 */
export async function getMilestone(
  escrowAddress: string,
  milestoneIndex: number
): Promise<EscrowMilestone> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);
  const milestone = await contract.getMilestone(milestoneIndex);

  const statusMap: BlockchainMilestoneStatus[] = ['Pending', 'Submitted', 'Approved', 'Disputed', 'Refunded'];
  return {
    amount: milestone[0],
    status: statusMap[Number(milestone[1])] as BlockchainMilestoneStatus,
    description: milestone[2],
  };
}

/**
 * Get milestone count
 */
export async function getMilestoneCount(escrowAddress: string): Promise<number> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);
  const count = await contract.getMilestoneCount();
  return Number(count);
}

/**
 * Get all milestones
 */
export async function getAllMilestones(escrowAddress: string): Promise<EscrowMilestone[]> {
  const count = await getMilestoneCount(escrowAddress);
  return Promise.all(
    Array.from({ length: count }, (_, i) => getMilestone(escrowAddress, i))
  );
}

/**
 * Get escrow balance
 */
export async function getEscrowBalance(escrowAddress: string): Promise<bigint> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);
  return contract.getBalance();
}

/**
 * Get remaining amount to be released
 */
export async function getRemainingAmount(escrowAddress: string): Promise<bigint> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);
  return contract.getRemainingAmount();
}

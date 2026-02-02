/**
 * Escrow Blockchain Integration
 * Real blockchain integration for escrow system using deployed smart contracts
 */

import { Contract, TransactionReceipt } from 'ethers';
import { getContractWithSigner, getContract, isWeb3Available, getWallet } from './web3-client.js';
import { FreelanceEscrowABI, FreelanceEscrowBytecode } from './contract-abis.js';
import { ContractFactory } from 'ethers';

export type MilestoneStatus = 'Pending' | 'Submitted' | 'Approved' | 'Disputed' | 'Refunded';

export type EscrowMilestone = {
  amount: bigint;
  status: MilestoneStatus;
  description: string;
};

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

  // Deploy contract with constructor parameters and send funds
  const contract = await factory.deploy(
    params.freelancerAddress,
    params.arbiterAddress,
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
 * Get escrow contract instance for reading
 */
function getEscrowContract(escrowAddress: string): Contract {
  return getContract(escrowAddress, FreelanceEscrowABI);
}

/**
 * Get escrow contract instance for writing
 */
function getEscrowContractWithSigner(escrowAddress: string): Contract {
  return getContractWithSigner(escrowAddress, FreelanceEscrowABI);
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
    (contract as any).employer(),
    (contract as any).freelancer(),
    (contract as any).arbiter(),
    (contract as any).totalAmount(),
    (contract as any).releasedAmount(),
    (contract as any).isActive(),
    (contract as any).contractId(),
    (contract as any).getBalance(),
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
 * Submit milestone for approval (freelancer)
 */
export async function submitMilestone(
  escrowAddress: string,
  milestoneIndex: number
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContractWithSigner(escrowAddress);
  const tx = await (contract as any).submitMilestone(milestoneIndex);
  const receipt = await tx.wait();

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

  const contract = getEscrowContractWithSigner(escrowAddress);
  const tx = await (contract as any).approveMilestone(milestoneIndex);
  const receipt = await tx.wait();

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

  const contract = getEscrowContractWithSigner(escrowAddress);
  const tx = await (contract as any).disputeMilestone(milestoneIndex);
  const receipt = await tx.wait();

  return {
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Resolve dispute (arbiter only)
 */
export async function resolveDispute(
  escrowAddress: string,
  milestoneIndex: number,
  inFavorOfFreelancer: boolean
): Promise<{ transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContractWithSigner(escrowAddress);
  const tx = await (contract as any).resolveDispute(milestoneIndex, inFavorOfFreelancer);
  const receipt = await tx.wait();

  return {
    transactionHash: receipt.hash,
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

  const contract = getEscrowContractWithSigner(escrowAddress);
  const tx = await (contract as any).refundMilestone(milestoneIndex);
  const receipt = await tx.wait();

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

  const contract = getEscrowContractWithSigner(escrowAddress);
  const tx = await (contract as any).cancelContract();
  const receipt = await tx.wait();

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
  const milestone = await (contract as any).getMilestone(milestoneIndex);

  return {
    amount: milestone[0],
    status: ['Pending', 'Submitted', 'Approved', 'Disputed', 'Refunded'][Number(milestone[1])] as MilestoneStatus,
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
  const count = await (contract as any).getMilestoneCount();
  return Number(count);
}

/**
 * Get all milestones
 */
export async function getAllMilestones(escrowAddress: string): Promise<EscrowMilestone[]> {
  const count = await getMilestoneCount(escrowAddress);
  const milestones: EscrowMilestone[] = [];

  for (let i = 0; i < count; i++) {
    const milestone = await getMilestone(escrowAddress, i);
    milestones.push(milestone);
  }

  return milestones;
}

/**
 * Get escrow balance
 */
export async function getEscrowBalance(escrowAddress: string): Promise<bigint> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);
  return await (contract as any).getBalance();
}

/**
 * Get remaining amount to be released
 */
export async function getRemainingAmount(escrowAddress: string): Promise<bigint> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getEscrowContract(escrowAddress);
  return await (contract as any).getRemainingAmount();
}

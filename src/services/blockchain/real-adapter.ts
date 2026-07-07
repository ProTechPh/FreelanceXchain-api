/**
 * Real Blockchain Adapter
 * Uses actual Web3 and deployed smart contracts on a real blockchain network
 */

import {
  IBlockchainAdapter,
  EscrowDeploymentParams,
  EscrowDeploymentResult,
  EscrowInfo,
  TransactionResult,
  MilestoneStatus,
} from './adapter.js';
import {
  deployEscrowContract as realDeployEscrow,
  getEscrowInfo as realGetEscrowInfo,
  submitMilestone as realSubmitMilestone,
  approveMilestone as realApproveMilestone,
  disputeMilestone as realDisputeMilestone,
  resolveDispute as realResolveDispute,
  cancelContract as realCancelContract,
  getMilestone as realGetMilestone,
  getEscrowBalance as realGetEscrowBalance,
} from '../escrow-blockchain.js';
import { isWeb3Available } from '../web3-client.js';

/**
 * Real Blockchain Adapter Implementation
 * Delegates to escrow-blockchain.ts which uses Web3 and deployed smart contracts
 */
export class RealBlockchainAdapter implements IBlockchainAdapter {
  isAvailable(): boolean {
    return isWeb3Available();
  }

  async deployEscrowContract(params: EscrowDeploymentParams): Promise<EscrowDeploymentResult> {
    const result = await realDeployEscrow({
      contractId: params.contractId,
      freelancerAddress: params.freelancerAddress,
      arbiterAddress: params.arbiterAddress,
      milestoneAmounts: params.milestoneAmounts,
      milestoneDescriptions: params.milestoneDescriptions,
      totalAmount: params.totalAmount,
    });

    return {
      escrowAddress: result.escrowAddress,
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  }

  async getEscrowInfo(escrowAddress: string): Promise<EscrowInfo> {
    return await realGetEscrowInfo(escrowAddress);
  }

  async submitMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult> {
    const result = await realSubmitMilestone(escrowAddress, milestoneIndex);
    return {
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  }

  async approveMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult> {
    const result = await realApproveMilestone(escrowAddress, milestoneIndex);
    return {
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  }

  async disputeMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult> {
    const result = await realDisputeMilestone(escrowAddress, milestoneIndex);
    return {
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  }

  async resolveDispute(
    escrowAddress: string,
    milestoneIndex: number,
    inFavorOfFreelancer: boolean
  ): Promise<TransactionResult> {
    const result = await realResolveDispute(escrowAddress, milestoneIndex, inFavorOfFreelancer);
    return {
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  }

  async refundEscrow(escrowAddress: string): Promise<TransactionResult> {
    const result = await realCancelContract(escrowAddress);
    return {
      transactionHash: result.transactionHash,
      receipt: result.receipt,
    };
  }

  async getMilestone(
    escrowAddress: string,
    milestoneIndex: number
  ): Promise<{ amount: bigint; status: MilestoneStatus; description: string }> {
    return await realGetMilestone(escrowAddress, milestoneIndex);
  }

  async getEscrowBalance(escrowAddress: string): Promise<bigint> {
    return await realGetEscrowBalance(escrowAddress);
  }
}

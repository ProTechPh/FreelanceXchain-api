/**
 * Simulated Blockchain Adapter
 * Uses Supabase database for simulated blockchain operations (no real blockchain)
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
  deployEscrow,
  depositToEscrow,
  releaseMilestone,
  refundMilestone,
  getEscrowBalance,
  getEscrowState,
  _getMilestoneStatus,
} from '../escrow-contract.js';

import { EscrowParams } from '../blockchain-types.js';

/**
 * Simulated Blockchain Adapter Implementation
 * Delegates to escrow-contract.ts which uses Supabase for simulation
 */
export class SimulatedBlockchainAdapter implements IBlockchainAdapter {
  isAvailable(): boolean {
    // Simulated mode is always available (uses Supabase)
    return true;
  }

  async deployEscrowContract(params: EscrowDeploymentParams): Promise<EscrowDeploymentResult> {
    // Convert to simulated escrow params
    const escrowParams: EscrowParams = {
      contractId: params.contractId,
      employerAddress: params.employerAddress,
      freelancerAddress: params.freelancerAddress,
      totalAmount: params.totalAmount,
      milestones: params.milestoneAmounts.map((amount, index) => ({
        id: `milestone-${index}`,
        amount,
        status: 'pending' as const,
      })),
    };

    const result = await deployEscrow(escrowParams);

    // Deposit funds to escrow after deployment
    await depositToEscrow(result.escrowAddress, params.totalAmount, params.employerAddress);

    return {
      escrowAddress: result.escrowAddress,
      transactionHash: result.transactionHash,
      receipt: {
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        status: 'success',
        gasUsed: BigInt(21000),
        timestamp: result.deployedAt,
      },
    };
  }

  async getEscrowInfo(escrowAddress: string): Promise<EscrowInfo> {
    const state = await getEscrowState(escrowAddress);
    if (!state) {
      throw new Error('Escrow not found');
    }

    // Calculate released amount
    const releasedAmount = state.milestones
      .filter(m => m.status === 'released')
      .reduce((sum, m) => sum + m.amount, BigInt(0));

    return {
      employer: state.employerAddress,
      freelancer: state.freelancerAddress,
      arbiter: state.employerAddress, // Simulated mode uses employer as arbiter
      totalAmount: state.totalAmount,
      releasedAmount,
      isActive: state.balance > BigInt(0),
      contractId: state.contractId,
      balance: state.balance,
    };
  }

  async submitMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult> {
    // Simulated mode doesn't require explicit milestone submission
    // Milestones are automatically "submitted" when created
    return {
      transactionHash: `sim-submit-${escrowAddress}-${milestoneIndex}-${Date.now()}`,
      receipt: {
        transactionHash: `sim-submit-${escrowAddress}-${milestoneIndex}-${Date.now()}`,
        blockNumber: Math.floor(Date.now() / 1000),
        status: 'success',
        gasUsed: BigInt(50000),
        timestamp: Date.now(),
      },
    };
  }

  async approveMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult> {
    const state = await getEscrowState(escrowAddress);
    if (!state) {
      throw new Error('Escrow not found');
    }

    if (milestoneIndex >= state.milestones.length) {
      throw new Error('Milestone index out of bounds');
    }

    const milestone = state.milestones[milestoneIndex];
    if (!milestone) {
      throw new Error('Milestone not found');
    }

    const receipt = await releaseMilestone(escrowAddress, milestone.id, state.employerAddress);

    return {
      transactionHash: receipt.transactionHash,
      receipt,
    };
  }

  async disputeMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult> {
    // Simulated mode doesn't support disputes - return simulated transaction
    return {
      transactionHash: `sim-dispute-${escrowAddress}-${milestoneIndex}-${Date.now()}`,
      receipt: {
        transactionHash: `sim-dispute-${escrowAddress}-${milestoneIndex}-${Date.now()}`,
        blockNumber: Math.floor(Date.now() / 1000),
        status: 'success',
        gasUsed: BigInt(75000),
        timestamp: Date.now(),
      },
    };
  }

  async resolveDispute(
    escrowAddress: string,
    milestoneIndex: number,
    inFavorOfFreelancer: boolean
  ): Promise<TransactionResult> {
    const state = await getEscrowState(escrowAddress);
    if (!state) {
      throw new Error('Escrow not found');
    }

    if (milestoneIndex >= state.milestones.length) {
      throw new Error('Milestone index out of bounds');
    }

    const milestone = state.milestones[milestoneIndex];
    if (!milestone) {
      throw new Error('Milestone not found');
    }

    // Resolve in favor of freelancer = release payment
    // Resolve in favor of employer = refund
    const receipt = inFavorOfFreelancer
      ? await releaseMilestone(escrowAddress, milestone.id, state.employerAddress)
      : await refundMilestone(escrowAddress, milestone.id, state.employerAddress);

    return {
      transactionHash: receipt.transactionHash,
      receipt,
    };
  }

  async refundEscrow(escrowAddress: string): Promise<TransactionResult> {
    const state = await getEscrowState(escrowAddress);
    if (!state) {
      throw new Error('Escrow not found');
    }

    // Refund all pending milestones
    const receipts = [];
    for (const milestone of state.milestones) {
      if (milestone.status === 'pending') {
        const receipt = await refundMilestone(escrowAddress, milestone.id, state.employerAddress);
        receipts.push(receipt);
      }
    }

    const lastReceipt = receipts[receipts.length - 1];
    return {
      transactionHash: lastReceipt?.transactionHash || `sim-refund-${escrowAddress}-${Date.now()}`,
      receipt: lastReceipt,
    };
  }

  async getMilestone(
    escrowAddress: string,
    milestoneIndex: number
  ): Promise<{ amount: bigint; status: MilestoneStatus; description: string }> {
    const state = await getEscrowState(escrowAddress);
    if (!state) {
      throw new Error('Escrow not found');
    }

    if (milestoneIndex >= state.milestones.length) {
      throw new Error('Milestone index out of bounds');
    }

    const milestone = state.milestones[milestoneIndex];
    if (!milestone) {
      throw new Error('Milestone not found');
    }

    return {
      amount: milestone.amount,
      status: milestone.status as MilestoneStatus,
      description: `Milestone ${milestoneIndex + 1}`,
    };
  }

  async getEscrowBalance(escrowAddress: string): Promise<bigint> {
    return await getEscrowBalance(escrowAddress);
  }
}

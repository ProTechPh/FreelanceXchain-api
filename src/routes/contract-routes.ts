import { Router, Request, Response } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID, validate, emptyBodySchema } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { clampLimit, clampOffset } from '../utils/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import { logger } from '../config/logger.js';
import {
  getContractById,
  getUserContracts,
  updateContractStatus,
  cancelPendingContract,
  getContractWalletAddresses,
} from '../services/contract-service.js';
import { initializeContractEscrow } from '../services/payment-service.js';
import { getProjectById } from '../services/project-service.js';
import { getDisputesByContract } from '../services/dispute-service.js';
import type { Contract } from '../utils/entity-mapper.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Contract:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         projectId:
 *           type: string
 *         proposalId:
 *           type: string
 *         freelancerId:
 *           type: string
 *         employerId:
 *           type: string
 *         escrowAddress:
 *           type: string
 *         totalAmount:
 *           type: number
 *         status:
 *           type: string
 *           enum: [pending, active, completed, disputed, cancelled]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: List user's contracts
 *     description: Retrieves all contracts for the authenticated user (as freelancer or employer)
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: continuationToken
 *         schema:
 *           type: string
 *         description: Token for pagination
 *     responses:
 *       200:
 *         description: Contracts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Contract'
 *                 hasMore:
 *                   type: boolean
 *                 continuationToken:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const offset = clampOffset(req.query['offset'] ? Number(req.query['offset']) : undefined);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const options = { limit, offset };

  const result = await getUserContracts(userId, options);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));


/**
 * @swagger
 * /api/contracts/{id}:
 *   get:
 *     summary: Get contract details
 *     description: Retrieves details of a specific contract
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Contract ID (UUID)
 *     responses:
 *       200:
 *         description: Contract retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract not found
 */
router.get('/:id', authMiddleware, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = getRequestId(req);
  const userId = req.user?.userId;

  const result = await getContractById(id);

  if (!result.success) {
    sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
    return;
  }

  const contract = result.data;
  if (userId && contract.freelancerId !== userId && contract.employerId !== userId) {
    // Check if user is admin (admins can view all contracts)
    if (req.user?.role !== 'admin') {
      sendErrorResponse(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this contract', { requestId });
      return;
    }
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/fund:
 *   post:
 *     summary: Fund contract escrow
 *     description: Employer funds the escrow for a pending contract, activating it
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Escrow funded and contract activated
 *       400:
 *         description: Contract not in pending status or missing wallet addresses
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only the employer can fund the escrow
 *       404:
 *         description: Contract not found
 */
type EnsureEscrowResult = { escrowAddress: string } | { error: { statusCode: number; code: string; message: string } };

/**
 * Deploy the escrow server-side for a contract that has none yet.
 * H1: Only use server-side escrow deployment. Do NOT accept arbitrary escrow
 * addresses from the frontend, as an attacker could submit a fake address to
 * bypass fund verification.
 */
async function ensureContractEscrow(contract: Contract): Promise<EnsureEscrowResult> {
  const projectResult = await getProjectById(contract.projectId);
  if (!projectResult.success) {
    return { error: { statusCode: 400, code: 'PROJECT_NOT_FOUND', message: 'Associated project not found' } };
  }

  const walletResult = await getContractWalletAddresses(contract.id);
  if (!walletResult.success) {
    return { error: { statusCode: 400, code: walletResult.error.code, message: walletResult.error.message } };
  }

  const { employerWallet, freelancerWallet } = walletResult.data;
  const { mapProjectFromEntity } = await import('../utils/entity-mapper.js');
  const project = mapProjectFromEntity(projectResult.data);

  const escrowResult = await initializeContractEscrow(
    contract,
    project,
    employerWallet,
    freelancerWallet
  );

  if (!escrowResult.success) {
    const statusCode = escrowResult.error?.code === 'AMOUNT_MISMATCH' ? 400 : 500;
    return { error: { statusCode, code: 'ESCROW_FAILED', message: escrowResult.error?.message || 'Failed to initialize escrow' } };
  }

  return { escrowAddress: escrowResult.data.escrowAddress };
}

router.post('/:id/fund', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateUUID(), validate(emptyBodySchema), asyncHandler(async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const contractResult = await getContractById(contractId);
  if (!contractResult.success) {
    sendErrorResponse(res, 404, 'NOT_FOUND', 'Contract not found', { requestId });
    return;
  }

  const contract = contractResult.data;

  // Only employer can fund
  if (contract.employerId !== userId) {
    sendErrorResponse(res, 403, 'FORBIDDEN', 'Only the employer can fund the escrow', { requestId });
    return;
  }

  // Must be pending
  if (contract.status === 'active' && contract.escrowAddress) {
    sendSuccessResponse(res, 200, {
      message: 'Contract already funded and active',
      escrowAddress: contract.escrowAddress,
      contractStatus: 'active',
    }, requestId);
    return;
  }

  if (contract.status !== 'pending') {
    sendErrorResponse(res, 400, 'INVALID_STATUS', `Contract is already '${contract.status}', cannot fund`, { requestId });
    return;
  }

  let escrowAddress = contract.escrowAddress;

  if (!escrowAddress) {
    // No escrow yet — deploy server-side
    const escrowResult = await ensureContractEscrow(contract);
    if ('error' in escrowResult) {
      sendErrorResponse(res, escrowResult.error.statusCode, escrowResult.error.code, escrowResult.error.message, { requestId });
      return;
    }
    escrowAddress = escrowResult.escrowAddress;
  }

  const { contractRepository } = await import('../repositories/contract-repository.js');
  await contractRepository.updateContract(contractId, { escrow_address: escrowAddress });

  // BLF-12.1: Pass userId and role to enforce authorization
  // Non-null assertions are safe here: authMiddleware guarantees req.user is populated,
  // and the guard above already returned 401 if userId was missing.
  const statusResult = await updateContractStatus(contractId, 'active', req.user!.userId, req.user!.role);
  if (!statusResult.success) {
    if (statusResult.error.code === 'INVALID_STATUS_TRANSITION') {
      const latestContractResult = await getContractById(contractId);
      if (latestContractResult.success && latestContractResult.data.status === 'active' && latestContractResult.data.escrowAddress) {
        sendSuccessResponse(res, 200, {
          message: 'Contract already funded and active',
          escrowAddress: latestContractResult.data.escrowAddress,
          contractStatus: 'active',
        }, requestId);
        return;
      }
    }

    sendErrorResponse(res, 500, 'ACTIVATION_FAILED', 'Escrow funded but contract activation failed', { requestId });
    return;
  }

  sendSuccessResponse(res, 200, {
    message: 'Contract funded and activated',
    escrowAddress,
    contractStatus: 'active',
  }, requestId);
}));

// Get contract funding info (for frontend MetaMask deployment)
router.get('/:id/fund-info', authMiddleware, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const contractResult = await getContractById(contractId);
  if (!contractResult.success) {
    sendErrorResponse(res, 404, 'NOT_FOUND', 'Contract not found', { requestId });
    return;
  }

  const contract = contractResult.data;
  if (contract.employerId !== userId) {
    sendErrorResponse(res, 403, 'FORBIDDEN', 'Only the employer can view fund info', { requestId });
    return;
  }

  const walletResult = await getContractWalletAddresses(contractId);
  if (!walletResult.success) {
    sendErrorResponse(res, 400, walletResult.error.code, walletResult.error.message, { requestId });
    return;
  }

  const projectResult = await getProjectById(contract.projectId);
  if (!projectResult.success) {
    sendErrorResponse(res, 400, 'PROJECT_NOT_FOUND', 'Associated project not found', { requestId });
    return;
  }

  const { mapProjectFromEntity } = await import('../utils/entity-mapper.js');
  const project = mapProjectFromEntity(projectResult.data);

  // Build milestone amounts in wei (ETH string -> wei)
  const { ethers } = await import('ethers');
  const milestoneAmounts = project.milestones.map(m => ethers.parseEther(m.amount.toString()).toString());
  const milestoneDescriptions = project.milestones.map(m => m.title || `Milestone ${m.id}`);
  const totalAmount = ethers.parseEther(contract.totalAmount.toString()).toString();

  // Server wallet address = platform that can approve milestones on employer's behalf
  const { getWallet } = await import('../services/web3-client.js');
  const platformWallet = getWallet().address;

  res.json({
    contractId,
    freelancerWallet: walletResult.data.freelancerWallet,
    platformWallet,
    milestoneAmounts,
    milestoneDescriptions,
    totalAmount,
  });
}));

/**
 * @swagger
 * /api/contracts/{id}/escrow/withdrawable:
 *   get:
 *     summary: Get pending escrow withdrawals (real blockchain mode)
 *     description: Returns the amounts credited to each party's pendingWithdrawals after a dispute resolution (pull-payment). Only meaningful when BLOCKCHAIN_MODE=real.
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pending withdrawal amounts
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to view this contract
 *       422:
 *         description: Only available in real blockchain mode
 */
router.get('/:id/escrow/withdrawable', authMiddleware, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const contractResult = await getContractById(contractId);
  if (!contractResult.success) {
    sendErrorResponse(res, 404, 'NOT_FOUND', 'Contract not found', { requestId });
    return;
  }

  const contract = contractResult.data;
  if (contract.freelancerId !== userId && contract.employerId !== userId && req.user?.role !== 'admin') {
    sendErrorResponse(res, 403, 'UNAUTHORIZED', 'You are not authorized to view this contract', { requestId });
    return;
  }

  const { getBlockchainMode } = await import('../services/blockchain/factory.js');
  const { isWeb3Available } = await import('../services/web3-client.js');
  if (getBlockchainMode() !== 'real' || !isWeb3Available()) {
    sendErrorResponse(res, 422, 'ESCROW_WITHDRAW_UNAVAILABLE', 'Escrow withdrawals are only available in real blockchain mode', { requestId });
    return;
  }

  if (!contract.escrowAddress) {
    sendErrorResponse(res, 400, 'ESCROW_NOT_FOUND', 'Contract has no escrow address', { requestId });
    return;
  }

  try {
    const { getWallet } = await import('../services/web3-client.js');
    const { getPendingWithdrawals } = await import('../services/escrow-blockchain.js');

    // On-chain employer is the platform/server wallet; the freelancer allocation
    // is keyed to the freelancer's own wallet address.
    const platformWallet = getWallet().address;
    const walletResult = await getContractWalletAddresses(contractId);
    if (!walletResult.success) {
      sendErrorResponse(res, 400, walletResult.error.code, walletResult.error.message, { requestId });
      return;
    }

    if (!walletResult.data.freelancerWallet) {
      sendErrorResponse(res, 400, 'WALLET_NOT_FOUND', 'Freelancer has no wallet address on file', { requestId });
      return;
    }

    const [platformAmount, freelancerAmount] = await Promise.all([
      getPendingWithdrawals(contract.escrowAddress, platformWallet),
      getPendingWithdrawals(contract.escrowAddress, walletResult.data.freelancerWallet),
    ]);

    res.status(200).json({
      contractId,
      escrowAddress: contract.escrowAddress,
      pendingWithdrawals: {
        platformWallet,
        platformAmount: platformAmount.toString(),
        freelancerWallet: walletResult.data.freelancerWallet,
        freelancerAmount: freelancerAmount.toString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching pending escrow withdrawals', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch pending escrow withdrawals', { requestId });
  }
}));

/**
 * @swagger
 * /api/contracts/{id}/escrow/withdraw:
 *   post:
 *     summary: Withdraw the employer's pending escrow allocation (real blockchain mode)
 *     description: The server wallet is the on-chain employer/platform, so this claims its allocation credited by a dispute resolution. Freelancers must claim their own allocation from their wallet via the escrow contract's withdraw().
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Withdrawal processed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only the employer or an admin can trigger the platform withdrawal
 *       422:
 *         description: Only available in real blockchain mode
 */
router.post('/:id/escrow/withdraw', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateUUID(), validate(emptyBodySchema), asyncHandler(async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const contractResult = await getContractById(contractId);
  if (!contractResult.success) {
    sendErrorResponse(res, 404, 'NOT_FOUND', 'Contract not found', { requestId });
    return;
  }

  const contract = contractResult.data;
  if (contract.employerId !== userId && req.user?.role !== 'admin') {
    sendErrorResponse(res, 403, 'UNAUTHORIZED', 'Only the employer (or an admin) can trigger the platform withdrawal. Freelancers must claim their allocation from their own wallet.', { requestId });
    return;
  }

  const { getBlockchainMode } = await import('../services/blockchain/factory.js');
  const { isWeb3Available } = await import('../services/web3-client.js');
  if (getBlockchainMode() !== 'real' || !isWeb3Available()) {
    sendErrorResponse(res, 422, 'ESCROW_WITHDRAW_UNAVAILABLE', 'Escrow withdrawals are only available in real blockchain mode', { requestId });
    return;
  }

  if (!contract.escrowAddress) {
    sendErrorResponse(res, 400, 'ESCROW_NOT_FOUND', 'Contract has no escrow address', { requestId });
    return;
  }

  try {
    const { withdrawFromEscrow } = await import('../services/escrow-blockchain.js');
    const result = await withdrawFromEscrow(contract.escrowAddress);
    sendSuccessResponse(res, 200, {
      message: 'Escrow withdrawal processed',
      transactionHash: result.transactionHash,
    }, requestId);
  } catch (error) {
    logger.error('Error withdrawing from escrow', error);
    sendErrorResponse(res, 500, 'WITHDRAW_FAILED', 'Failed to withdraw from escrow', { requestId });
  }
}));

/**
 * @swagger
 * /api/contracts/{id}/cancel:
 *   post:
 *     summary: Cancel a pending contract
 *     description: Cancel a contract that is still in pending status
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contract cancelled successfully
 *       400:
 *         description: Contract cannot be cancelled
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract not found
 */
router.post('/:id/cancel', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateUUID(), validate(emptyBodySchema), asyncHandler(async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await cancelPendingContract(contractId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404
      : result.error?.code === 'UNAUTHORIZED' ? 403
      : 400;
    sendErrorResponse(res, statusCode, result.error?.code || 'CANCEL_FAILED', result.error?.message || 'Failed to cancel contract', { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Contract cancelled successfully' }, requestId);
}));

/**
 * @swagger
 * /api/contracts/{contractId}/disputes:
 *   get:
 *     summary: List disputes for a contract
 *     description: Get all disputes associated with a contract
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of disputes
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to view disputes
 *       404:
 *         description: Contract not found
 */
router.get('/:contractId/disputes', authMiddleware, apiRateLimiter, validateUUID(['contractId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const contractId = req.params['contractId'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  try {
    const result = await getDisputesByContract(contractId, userId);

    if (!result.success) {
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                        result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
      return;
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error fetching contract disputes', error);
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch disputes', { requestId });
  }
}));

export default router;

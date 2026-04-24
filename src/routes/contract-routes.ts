import { Router, Request, Response } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { clampLimit, clampOffset } from '../utils/index.js';
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
router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const offset = clampOffset(req.query['offset'] ? Number(req.query['offset']) : undefined);

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const options = { limit, offset };

  const result = await getUserContracts(userId, options);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});


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
router.get('/:id', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const userId = req.user?.userId;

  const result = await getContractById(id);

  if (!result.success) {
    res.status(404).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // FIXED: Authorization check - only contract parties can view contract details
  const contract = result.data;
  if (userId && contract.freelancerId !== userId && contract.employerId !== userId) {
    // Check if user is admin (admins can view all contracts)
    if (req.user?.role !== 'admin') {
      res.status(403).json({
        error: { code: 'UNAUTHORIZED', message: 'You are not authorized to view this contract' },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }
  }

  res.status(200).json(result.data);
});

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
router.post('/:id/fund', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Get contract
  const contractResult = await getContractById(contractId);
  if (!contractResult.success) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const contract = contractResult.data;

  // Only employer can fund
  if (contract.employerId !== userId) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Only the employer can fund the escrow' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Must be pending
  if (contract.status === 'active' && contract.escrowAddress) {
    res.status(200).json({
      message: 'Contract already funded and active',
      escrowAddress: contract.escrowAddress,
      contractStatus: 'active',
    });
    return;
  }

  if (contract.status !== 'pending') {
    res.status(400).json({
      error: { code: 'INVALID_STATUS', message: `Contract is already '${contract.status}', cannot fund` },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Accept frontend-deployed escrow address (MetaMask flow)
  const { escrowAddress: frontendEscrowAddress, transactionHash: _frontendTxHash } = req.body || {};

  let escrowAddress = contract.escrowAddress || frontendEscrowAddress;

  if (!escrowAddress) {
    // No escrow from frontend — fall back to server-side deployment
    const projectResult = await getProjectById(contract.projectId);
    if (!projectResult.success) {
      res.status(400).json({
        error: { code: 'PROJECT_NOT_FOUND', message: 'Associated project not found' },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const walletResult = await getContractWalletAddresses(contractId);
    if (!walletResult.success) {
      res.status(400).json({
        error: { code: walletResult.error.code, message: walletResult.error.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
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
      res.status(statusCode).json({
        error: { code: 'ESCROW_FAILED', message: escrowResult.error?.message || 'Failed to initialize escrow' },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    escrowAddress = escrowResult.data.escrowAddress;
  }

  // Save escrow address on the contract record
  const { contractRepository } = await import('../repositories/contract-repository.js');
  await contractRepository.updateContract(contractId, { escrow_address: escrowAddress });

  // Activate the contract
  const statusResult = await updateContractStatus(contractId, 'active');
  if (!statusResult.success) {
    if (statusResult.error.code === 'INVALID_STATUS_TRANSITION') {
      const latestContractResult = await getContractById(contractId);
      if (latestContractResult.success && latestContractResult.data.status === 'active' && latestContractResult.data.escrowAddress) {
        res.status(200).json({
          message: 'Contract already funded and active',
          escrowAddress: latestContractResult.data.escrowAddress,
          contractStatus: 'active',
        });
        return;
      }
    }

    res.status(500).json({
      error: { code: 'ACTIVATION_FAILED', message: 'Escrow funded but contract activation failed' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({
    message: 'Contract funded and activated',
    escrowAddress,
    contractStatus: 'active',
  });
});

// Get contract funding info (for frontend MetaMask deployment)
router.get('/:id/fund-info', authMiddleware, validateUUID(), async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' } });
    return;
  }

  const contractResult = await getContractById(contractId);
  if (!contractResult.success) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contract not found' } });
    return;
  }

  const contract = contractResult.data;
  if (contract.employerId !== userId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the employer can view fund info' } });
    return;
  }

  const walletResult = await getContractWalletAddresses(contractId);
  if (!walletResult.success) {
    res.status(400).json({ error: { code: walletResult.error.code, message: walletResult.error.message } });
    return;
  }

  const projectResult = await getProjectById(contract.projectId);
  if (!projectResult.success) {
    res.status(400).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Associated project not found' } });
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
});

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
router.post('/:id/cancel', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const contractId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await cancelPendingContract(contractId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404
      : result.error?.code === 'UNAUTHORIZED' ? 403
      : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code || 'CANCEL_FAILED', message: result.error?.message || 'Failed to cancel contract' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({
    message: 'Contract cancelled successfully',
  });
});

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
router.get('/:contractId/disputes', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const contractId = req.params['contractId'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  try {
    const result = await getDisputesByContract(contractId, userId);

    if (!result.success) {
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                        result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      res.status(statusCode).json({
        error: { code: result.error.code, message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error fetching contract disputes:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch disputes' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
});

export default router;

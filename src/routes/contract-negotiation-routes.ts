import { Router, Request, Response } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import {
  validateAppwriteDocumentId,
  validate,
  emptyBodySchema,
  createContractOfferSchema,
  declineContractOfferSchema,
  submitContractSignatureSchema,
} from '../middleware/validation-middleware.js';
import { apiRateLimiter, walletRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import type { ServiceResult } from '../types/service-result.js';
import {
  getNegotiation,
  createOffer,
  acceptOffer,
  declineOffer,
  withdrawOffer,
  reopenNegotiation,
} from '../services/contract-negotiation-service.js';
import { getSigningPayload, listSignatures, submitSignature } from '../services/contract-signature-service.js';

const router = Router();

const CONFLICT_CODES = new Set([
  'INVALID_STATUS',
  'INVALID_STATUS_TRANSITION',
  'OFFER_NOT_OPEN',
  'CANNOT_ACCEPT_OWN_OFFER',
  'CANNOT_DECLINE_OWN_OFFER',
  'NEGOTIATION_LIMIT_REACHED',
  'FREELANCER_SIGNATURE_REQUIRED',
  'ALREADY_SIGNED',
  'TERMS_HASH_MISMATCH',
  'TERMS_NOT_LOCKED',
  'WALLET_CHANGED',
]);

function statusFor(code: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'UNAUTHORIZED') return 403;
  if (CONFLICT_CODES.has(code)) return 409;
  if (code === 'UPDATE_FAILED') return 500;
  return 400;
}

function sendServiceError(res: Response, result: Extract<ServiceResult<unknown>, { success: false }>, requestId: string): void {
  sendErrorResponse(res, statusFor(result.error.code), result.error.code, result.error.message, {
    requestId,
    ...(result.error.details ? { details: result.error.details } : {}),
  });
}

function requireUser(req: Request, res: Response): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
    return null;
  }
  return userId;
}

/**
 * @swagger
 * /api/contracts/{id}/negotiation:
 *   get:
 *     summary: Get contract negotiation state
 *     description: Offers, the freelancer's floor rate, the project template and what the caller may do next.
 *     tags:
 *       - Contract Negotiation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Negotiation state
 *       403:
 *         description: Not a contract party
 *       404:
 *         description: Contract not found
 */
router.get('/:id/negotiation', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await getNegotiation(req.params['id'] ?? '', userId, req.user?.role);
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/offers:
 *   post:
 *     summary: Propose or counter contract terms
 *     description: The base amount cannot go below the freelancer's proposed rate and milestones must sum to the total.
 *     tags:
 *       - Contract Negotiation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Offer created
 *       400:
 *         description: Invalid terms (FLOOR_VIOLATION, AMOUNT_MISMATCH, VALIDATION_ERROR)
 *       409:
 *         description: Contract is not negotiating
 */
router.post('/:id/offers', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateAppwriteDocumentId(), validate(createContractOfferSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await createOffer(req.params['id'] ?? '', userId, req.body);
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.status(201).json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/offers/{offerId}/accept:
 *   post:
 *     summary: Accept the open offer and lock the terms
 *     tags:
 *       - Contract Negotiation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Terms locked; contract is awaiting signatures
 */
router.post('/:id/offers/:offerId/accept', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateAppwriteDocumentId(['id', 'offerId']), validate(emptyBodySchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await acceptOffer(req.params['id'] ?? '', req.params['offerId'] ?? '', userId);
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/offers/{offerId}/decline:
 *   post:
 *     summary: Decline the open offer (optionally ending the negotiation)
 *     tags:
 *       - Contract Negotiation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offer declined
 */
router.post('/:id/offers/:offerId/decline', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateAppwriteDocumentId(['id', 'offerId']), validate(declineContractOfferSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await declineOffer(req.params['id'] ?? '', req.params['offerId'] ?? '', userId, {
    reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
    endNegotiation: req.body?.endNegotiation === true,
  });
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/offers/{offerId}/withdraw:
 *   post:
 *     summary: Withdraw your own open offer
 *     tags:
 *       - Contract Negotiation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offer withdrawn
 */
router.post('/:id/offers/:offerId/withdraw', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateAppwriteDocumentId(['id', 'offerId']), validate(emptyBodySchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await withdrawOffer(req.params['id'] ?? '', req.params['offerId'] ?? '', userId);
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/negotiation/reopen:
 *   post:
 *     summary: Request changes to locked terms before both parties sign
 *     tags:
 *       - Contract Negotiation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Back to negotiating; signatures voided
 */
router.post('/:id/negotiation/reopen', authMiddleware, requireVerifiedKyc, apiRateLimiter, validateAppwriteDocumentId(), validate(emptyBodySchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await reopenNegotiation(req.params['id'] ?? '', userId);
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/signing-payload:
 *   get:
 *     summary: Locked terms and EIP-712 typed data to sign
 *     tags:
 *       - Contract Signatures
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signing payload
 *       409:
 *         description: Terms not locked yet
 */
router.get('/:id/signing-payload', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await getSigningPayload(req.params['id'] ?? '', userId, req.user?.role);
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/signatures:
 *   get:
 *     summary: Valid signatures over the current terms
 *     tags:
 *       - Contract Signatures
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signatures
 */
router.get('/:id/signatures', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await listSignatures(req.params['id'] ?? '', userId, req.user?.role);
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.json(result.data);
}));

/**
 * @swagger
 * /api/contracts/{id}/signatures:
 *   post:
 *     summary: Sign the contract (drawn/typed signature + EIP-712 wallet signature)
 *     description: The freelancer signs first. The employer's signature moves the contract to awaiting_funding.
 *     tags:
 *       - Contract Signatures
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Signature recorded
 *       400:
 *         description: Invalid signature or consent missing
 *       409:
 *         description: Out of order, already signed or terms changed
 */
router.post('/:id/signatures', authMiddleware, requireVerifiedKyc, walletRateLimiter, validateAppwriteDocumentId(), validate(submitContractSignatureSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await submitSignature(req.params['id'] ?? '', userId, req.body, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });
  if (!result.success) return sendServiceError(res, result, getRequestId(req));
  res.status(201).json(result.data);
}));

export default router;

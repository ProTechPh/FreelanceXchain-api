import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import {
  getKycStatus,
  submitKyc,
  reviewKyc,
  getPendingKycReviews,
  getAllKycByStatus,
  addDocument,
  createLivenessSession,
  verifyLiveness,
  verifyFaceMatch,
  getLivenessSession,
  getSupportedCountries,
  getCountryRequirements,
  isKycError,
} from '../services/kyc-service.js';
import { KycSubmissionInput, KycReviewInput, KycStatus, DocumentType } from '../models/kyc.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     InternationalAddress:
 *       type: object
 *       required:
 *         - addressLine1
 *         - city
 *         - country
 *         - countryCode
 *       properties:
 *         addressLine1:
 *           type: string
 *         addressLine2:
 *           type: string
 *         city:
 *           type: string
 *         stateProvince:
 *           type: string
 *         postalCode:
 *           type: string
 *         country:
 *           type: string
 *         countryCode:
 *           type: string
 *           description: ISO 3166-1 alpha-2 country code
 *     KycDocument:
 *       type: object
 *       required:
 *         - type
 *         - documentNumber
 *         - issuingCountry
 *         - frontImageUrl
 *       properties:
 *         type:
 *           type: string
 *           enum: [passport, national_id, drivers_license, residence_permit, voter_id, tax_id, social_security, birth_certificate, utility_bill, bank_statement]
 *         documentNumber:
 *           type: string
 *         issuingCountry:
 *           type: string
 *         issuingAuthority:
 *           type: string
 *         issueDate:
 *           type: string
 *           format: date
 *         expiryDate:
 *           type: string
 *           format: date
 *         frontImageUrl:
 *           type: string
 *         backImageUrl:
 *           type: string
 *     LivenessChallenge:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [blink, smile, turn_left, turn_right, nod, open_mouth]
 *         completed:
 *           type: boolean
 *         timestamp:
 *           type: string
 *           format: date-time
 *     LivenessCheck:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         sessionId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, passed, failed, expired]
 *         confidenceScore:
 *           type: number
 *         challenges:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/LivenessChallenge'
 *         expiresAt:
 *           type: string
 *           format: date-time
 *     KycSubmissionInput:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - dateOfBirth
 *         - nationality
 *         - address
 *         - document
 *       properties:
 *         firstName:
 *           type: string
 *         middleName:
 *           type: string
 *         lastName:
 *           type: string
 *         dateOfBirth:
 *           type: string
 *           format: date
 *         placeOfBirth:
 *           type: string
 *         nationality:
 *           type: string
 *         secondaryNationality:
 *           type: string
 *         taxResidenceCountry:
 *           type: string
 *         taxIdentificationNumber:
 *           type: string
 *         address:
 *           $ref: '#/components/schemas/InternationalAddress'
 *         document:
 *           $ref: '#/components/schemas/KycDocument'
 *         selfieImageUrl:
 *           type: string
 *         tier:
 *           type: string
 *           enum: [basic, standard, enhanced]
 *     KycVerification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, submitted, under_review, approved, rejected]
 *         tier:
 *           type: string
 *           enum: [basic, standard, enhanced]
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         nationality:
 *           type: string
 *         address:
 *           $ref: '#/components/schemas/InternationalAddress'
 *         documents:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/KycDocument'
 *         livenessCheck:
 *           $ref: '#/components/schemas/LivenessCheck'
 *         faceMatchScore:
 *           type: number
 *         faceMatchStatus:
 *           type: string
 *           enum: [pending, matched, not_matched]
 *         amlScreeningStatus:
 *           type: string
 *           enum: [pending, clear, flagged, review_required]
 *         riskLevel:
 *           type: string
 *           enum: [low, medium, high]
 *     SupportedCountry:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         supportedDocuments:
 *           type: array
 *           items:
 *             type: string
 *         requiresLiveness:
 *           type: boolean
 *         requiresAddressProof:
 *           type: boolean
 *         tier:
 *           type: string
 */

const VALID_DOCUMENT_TYPES: DocumentType[] = ['passport', 'national_id', 'drivers_license', 'residence_permit', 'voter_id', 'tax_id', 'social_security', 'birth_certificate', 'utility_bill', 'bank_statement'];
const VALID_KYC_STATUSES: KycStatus[] = ['pending', 'submitted', 'under_review', 'approved', 'rejected'];

function validateKycSubmission(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const data = input as Record<string, unknown>;

  if (!data.firstName || typeof data.firstName !== 'string') errors.push('firstName is required');
  if (!data.lastName || typeof data.lastName !== 'string') errors.push('lastName is required');
  if (!data.dateOfBirth || typeof data.dateOfBirth !== 'string') errors.push('dateOfBirth is required');
  if (!data.nationality || typeof data.nationality !== 'string') errors.push('nationality is required');

  const address = data.address as Record<string, unknown> | undefined;
  if (!address) {
    errors.push('address is required');
  } else {
    if (!address.addressLine1) errors.push('address.addressLine1 is required');
    if (!address.city) errors.push('address.city is required');
    if (!address.country) errors.push('address.country is required');
    if (!address.countryCode) errors.push('address.countryCode is required');
  }

  const doc = data.document as Record<string, unknown> | undefined;
  if (!doc) {
    errors.push('document is required');
  } else {
    if (!doc.type || !VALID_DOCUMENT_TYPES.includes(doc.type as DocumentType)) {
      errors.push('document.type must be one of: ' + VALID_DOCUMENT_TYPES.join(', '));
    }
    if (!doc.documentNumber) errors.push('document.documentNumber is required');
    if (!doc.issuingCountry) errors.push('document.issuingCountry is required');
    if (!doc.frontImageUrl) errors.push('document.frontImageUrl is required');
  }

  return { valid: errors.length === 0, errors };
}


/**
 * @swagger
 * /api/kyc/countries:
 *   get:
 *     summary: Get supported countries for KYC
 *     description: Returns list of countries with their KYC requirements
 *     tags:
 *       - KYC
 *     responses:
 *       200:
 *         description: List of supported countries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SupportedCountry'
 */
router.get('/countries', (_req: Request, res: Response) => {
  res.status(200).json(getSupportedCountries());
});

/**
 * @swagger
 * /api/kyc/countries/{countryCode}:
 *   get:
 *     summary: Get KYC requirements for a specific country
 *     tags:
 *       - KYC
 *     parameters:
 *       - in: path
 *         name: countryCode
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO 3166-1 alpha-2 country code
 *     responses:
 *       200:
 *         description: Country requirements
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SupportedCountry'
 *       404:
 *         description: Country not supported
 */
router.get('/countries/:countryCode', (req: Request, res: Response) => {
  const countryCode = req.params['countryCode']?.toUpperCase();
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!countryCode) {
    res.status(400).json({
      error: { code: 'INVALID_COUNTRY_CODE', message: 'Country code is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const country = getCountryRequirements(countryCode);
  if (!country) {
    res.status(404).json({
      error: { code: 'COUNTRY_NOT_SUPPORTED', message: `KYC not available for country: ${countryCode}` },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(country);
});

/**
 * @swagger
 * /api/kyc/status:
 *   get:
 *     summary: Get current user's KYC status
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KycVerification'
 *       404:
 *         description: No KYC verification found
 */
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getKycStatus(userId);

  if (isKycError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!result) {
    res.status(404).json({
      error: { code: 'KYC_NOT_FOUND', message: 'No KYC verification found' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result);
});

/**
 * @swagger
 * /api/kyc/submit:
 *   post:
 *     summary: Submit KYC verification
 *     description: Submit identity documents and personal information for international KYC verification
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KycSubmissionInput'
 *     responses:
 *       201:
 *         description: KYC submitted successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: KYC already pending or approved
 */
router.post('/submit', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const validation = validateKycSubmission(req.body);
  if (!validation.valid) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: validation.errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const input: KycSubmissionInput = req.body;
  const result = await submitKyc(userId, input);

  if (isKycError(result)) {
    const statusCode = result.code === 'KYC_ALREADY_APPROVED' || result.code === 'KYC_PENDING' ? 409 : 400;
    res.status(statusCode).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result);
});

/**
 * @swagger
 * /api/kyc/liveness/session:
 *   post:
 *     summary: Create a face liveness verification session
 *     description: Initiates a liveness check session with random challenges
 *     tags:
 *       - KYC Liveness
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challenges:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [blink, smile, turn_left, turn_right, nod, open_mouth]
 *     responses:
 *       201:
 *         description: Liveness session created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LivenessCheck'
 *       400:
 *         description: KYC not found or already approved
 */
router.post('/liveness/session', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await createLivenessSession(userId, req.body);

  if (isKycError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result);
});

/**
 * @swagger
 * /api/kyc/liveness/session:
 *   get:
 *     summary: Get current liveness session
 *     tags:
 *       - KYC Liveness
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current liveness session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LivenessCheck'
 */
router.get('/liveness/session', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getLivenessSession(userId);

  if (isKycError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!result) {
    res.status(404).json({
      error: { code: 'NO_LIVENESS_SESSION', message: 'No active liveness session' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result);
});

/**
 * @swagger
 * /api/kyc/liveness/verify:
 *   post:
 *     summary: Submit liveness verification results
 *     description: Submit captured frames and challenge results for liveness verification
 *     tags:
 *       - KYC Liveness
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - capturedFrames
 *               - challengeResults
 *             properties:
 *               sessionId:
 *                 type: string
 *               capturedFrames:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Base64 encoded frame images
 *               challengeResults:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     completed:
 *                       type: boolean
 *                     timestamp:
 *                       type: string
 *     responses:
 *       200:
 *         description: Liveness verification result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LivenessCheck'
 */
router.post('/liveness/verify', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { sessionId, capturedFrames, challengeResults } = req.body;

  if (!sessionId || !capturedFrames || !challengeResults) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'sessionId, capturedFrames, and challengeResults are required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await verifyLiveness(userId, { sessionId, capturedFrames, challengeResults });

  if (isKycError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result);
});

/**
 * @swagger
 * /api/kyc/face-match:
 *   post:
 *     summary: Verify face match between selfie and document
 *     tags:
 *       - KYC Liveness
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - selfieImageUrl
 *               - documentImageUrl
 *             properties:
 *               selfieImageUrl:
 *                 type: string
 *               documentImageUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Face match result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matched:
 *                   type: boolean
 *                 score:
 *                   type: number
 */
router.post('/face-match', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { selfieImageUrl, documentImageUrl } = req.body;

  if (!selfieImageUrl || !documentImageUrl) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'selfieImageUrl and documentImageUrl are required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await verifyFaceMatch(userId, { selfieImageUrl, documentImageUrl });

  if (isKycError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result);
});

/**
 * @swagger
 * /api/kyc/documents:
 *   post:
 *     summary: Add additional document to KYC
 *     tags:
 *       - KYC
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KycDocument'
 *     responses:
 *       200:
 *         description: Document added successfully
 */
router.post('/documents', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { type, documentNumber, issuingCountry, issuingAuthority, issueDate, expiryDate, frontImageUrl, backImageUrl } = req.body;

  if (!type || !VALID_DOCUMENT_TYPES.includes(type)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid document type' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await addDocument(userId, {
    type,
    documentNumber,
    issuingCountry,
    issuingAuthority,
    issueDate,
    expiryDate,
    frontImageUrl,
    backImageUrl,
  });

  if (isKycError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result);
});


/**
 * @swagger
 * /api/kyc/admin/pending:
 *   get:
 *     summary: Get pending KYC reviews (Admin only)
 *     tags:
 *       - KYC Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending KYC list
 */
router.get('/admin/pending', authMiddleware, requireRole('admin'), async (_req: Request, res: Response) => {
  const result = await getPendingKycReviews();
  res.status(200).json(result);
});

/**
 * @swagger
 * /api/kyc/admin/status/{status}:
 *   get:
 *     summary: Get KYC verifications by status (Admin only)
 *     tags:
 *       - KYC Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pending, submitted, under_review, approved, rejected]
 *     responses:
 *       200:
 *         description: KYC list by status
 */
router.get('/admin/status/:status', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const status = req.params['status'];
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!status || !VALID_KYC_STATUSES.includes(status as KycStatus)) {
    res.status(400).json({
      error: { code: 'INVALID_STATUS', message: 'Invalid KYC status' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getAllKycByStatus(status as KycStatus);
  res.status(200).json(result);
});

/**
 * @swagger
 * /api/kyc/admin/review/{kycId}:
 *   post:
 *     summary: Review KYC verification (Admin only)
 *     description: Approve or reject a KYC verification with AML screening results
 *     tags:
 *       - KYC Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kycId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               rejectionReason:
 *                 type: string
 *               rejectionCode:
 *                 type: string
 *                 enum: [DOCUMENT_EXPIRED, DOCUMENT_UNREADABLE, DOCUMENT_TAMPERED, FACE_MISMATCH, LIVENESS_FAILED, AML_FLAGGED, SANCTIONS_MATCH, PEP_MATCH, INCOMPLETE_INFO, FRAUDULENT_ACTIVITY, OTHER]
 *               riskLevel:
 *                 type: string
 *                 enum: [low, medium, high]
 *               riskScore:
 *                 type: number
 *               amlScreeningStatus:
 *                 type: string
 *                 enum: [clear, flagged, review_required]
 *               amlScreeningNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: KYC reviewed successfully
 *       404:
 *         description: KYC not found
 */
router.post('/admin/review/:kycId', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const kycId = req.params['kycId'];
  const reviewerId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!kycId || !reviewerId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const { status, rejectionReason, rejectionCode, riskLevel, riskScore, amlScreeningStatus, amlScreeningNotes } = req.body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Status must be approved or rejected' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const input: KycReviewInput = { status, rejectionReason, rejectionCode, riskLevel, riskScore, amlScreeningStatus, amlScreeningNotes };
  const result = await reviewKyc(kycId, reviewerId, input);

  if (isKycError(result)) {
    const statusCode = result.code === 'KYC_NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result);
});

export default router;

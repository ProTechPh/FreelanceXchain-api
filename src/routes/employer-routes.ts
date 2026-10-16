import { Router, Request, Response } from 'express';
import { authMiddleware, optionalAuthMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateAppwriteDocumentId } from '../middleware/validation-middleware.js';
import { apiRateLimiter, fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { uploadBusinessDocument as uploadBusinessDocumentMiddleware } from '../middleware/file-upload-middleware.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendValidationError } from '../utils/response-helpers.js';
import { clampLimit } from '../utils/index.js';
import {
  getEmployerProfileByUserId,
  updateEmployerProfile,
  ensureEmployerProfile,
} from '../services/employer-profile-service.js';
import type { UpdateEmployerProfileInput } from '../services/employer-profile-service.js';
import {
  listBusinessDocuments,
  uploadBusinessDocument,
  deleteBusinessDocument,
  getBusinessProfileCompleteness,
} from '../services/employer-business-document-service.js';
import {
  BUSINESS_TYPES,
  BUSINESS_DOCUMENT_TYPES,
  type BusinessDocumentType,
  type EmployerProfile,
} from '../models/employer-profile.js';
import { listProjectsByEmployer } from '../services/project-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

type FieldError = { field: string; message: string };

const TIN_PATTERN = /^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/;
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Business fields only signed-in users can see on a public employer profile.
const PRIVATE_BUSINESS_FIELDS = ['tin', 'registrationNumber', 'businessAddress', 'businessPhone', 'businessEmail'] as const;

function isNonEmptyString(value: unknown, min = 1): value is string {
  return typeof value === 'string' && value.trim().length >= min;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate the business fields of a PATCH /profile body. Format checks only:
 * the values are stored as provided and not checked against BIR/DTI/SEC records.
 */
function validateBusinessFields(body: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const { businessType, tin, registrationNumber, businessAddress, businessPhone, businessEmail, website, yearEstablished } = body;

  if (businessType !== undefined && !(BUSINESS_TYPES as readonly unknown[]).includes(businessType)) {
    errors.push({ field: 'businessType', message: `Business type must be one of: ${BUSINESS_TYPES.join(', ')}` });
  }
  if (tin !== undefined && (typeof tin !== 'string' || !TIN_PATTERN.test(tin.trim()))) {
    errors.push({ field: 'tin', message: 'TIN must look like 123-456-789 or 123-456-789-000' });
  }
  if (registrationNumber !== undefined && (!isNonEmptyString(registrationNumber, 3) || registrationNumber.length > 50)) {
    errors.push({ field: 'registrationNumber', message: 'Registration number must be 3 to 50 characters' });
  }
  if (businessAddress !== undefined && (!isNonEmptyString(businessAddress, 5) || businessAddress.length > 500)) {
    errors.push({ field: 'businessAddress', message: 'Business address must be 5 to 500 characters' });
  }
  if (businessPhone !== undefined && (typeof businessPhone !== 'string' || !PHONE_PATTERN.test(businessPhone.trim()))) {
    errors.push({ field: 'businessPhone', message: 'Business phone must be a valid phone number' });
  }
  if (businessEmail !== undefined && (typeof businessEmail !== 'string' || businessEmail.length > 255 || !EMAIL_PATTERN.test(businessEmail.trim()))) {
    errors.push({ field: 'businessEmail', message: 'Business email must be a valid email address' });
  }
  if (website !== undefined && website !== null && website !== '' && (typeof website !== 'string' || website.length > 500 || !isHttpUrl(website.trim()))) {
    errors.push({ field: 'website', message: 'Website must be a valid http(s) URL' });
  }
  const currentYear = new Date().getFullYear();
  if (yearEstablished !== undefined && (typeof yearEstablished !== 'number' || !Number.isInteger(yearEstablished) || yearEstablished < 1800 || yearEstablished > currentYear)) {
    errors.push({ field: 'yearEstablished', message: `Year established must be between 1800 and ${currentYear}` });
  }
  return errors;
}

function trimIfString<T>(value: T): T {
  return (typeof value === 'string' ? value.trim() : value) as T;
}

function redactPrivateBusinessFields(profile: EmployerProfile): EmployerProfile {
  const redacted = { ...profile };
  for (const field of PRIVATE_BUSINESS_FIELDS) {
    redacted[field] = null;
  }
  return redacted;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployerProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         companyName:
 *           type: string
 *         description:
 *           type: string
 *         industry:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/employers/projects:
 *   get:
 *     summary: List employer's projects
 *     description: Retrieves all projects created by the authenticated employer with proposal counts
 *     tags:
 *       - Employers
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
 *         description: Projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Project'
 *                       - type: object
 *                         properties:
 *                           proposalCount:
 *                             type: integer
 *                 hasMore:
 *                   type: boolean
 *                 continuationToken:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/projects', authMiddleware, requireRole('employer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const continuationToken = req.query['continuationToken'] as string | undefined;

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const options: { maxItemCount: number; continuationToken?: string } = { maxItemCount: limit };
  if (continuationToken) {
    options.continuationToken = continuationToken;
  }
  const result = await listProjectsByEmployer(userId, options);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));


/**
 * @swagger
 * /api/employers/profile:
 *   get:
 *     summary: Get current user's employer profile
 *     description: Retrieves the authenticated user's employer profile
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployerProfile'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.get('/profile', authMiddleware, requireRole('employer', 'freelancer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getEmployerProfileByUserId(userId);

  if (!result.success) {
    sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));


/**
 * @swagger
 * /api/employers/profile:
 *   patch:
 *     summary: Update employer profile
 *     description: Updates the authenticated user's employer profile
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *               description:
 *                 type: string
 *               industry:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployerProfile'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.patch('/profile', authMiddleware, requireRole('employer', 'freelancer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { companyName, description, industry } = req.body;
  const body = req.body as Record<string, unknown>;
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // Validate input
  const errors: { field: string; message: string }[] = [];
  if (companyName !== undefined && (typeof companyName !== 'string' || companyName.trim().length < 2)) {
    errors.push({ field: 'companyName', message: 'Company name must be at least 2 characters' });
  }
  if (description !== undefined && (typeof description !== 'string' || description.trim().length < 10)) {
    errors.push({ field: 'description', message: 'Description must be at least 10 characters' });
  }
  if (industry !== undefined && (typeof industry !== 'string' || industry.trim().length < 2)) {
    errors.push({ field: 'industry', message: 'Industry must be at least 2 characters' });
  }
  errors.push(...validateBusinessFields(body));

  if (errors.length > 0) {
    sendValidationError(res, errors, requestId);
    return;
  }

  const input: UpdateEmployerProfileInput = { companyName, description, industry };
  const businessKeys = ['businessType', 'tin', 'registrationNumber', 'businessAddress', 'businessPhone', 'businessEmail', 'website', 'yearEstablished'] as const;
  for (const key of businessKeys) {
    if (body[key] !== undefined) {
      (input as Record<string, unknown>)[key] = trimIfString(body[key]);
    }
  }

  const result = await updateEmployerProfile(userId, input);

  if (!result.success) {
    const statusCode = result.error.code === 'PROFILE_NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/employers/profile:
 *   post:
 *     summary: Create the employer profile if it does not exist yet
 *     description: Idempotent. Lets a freelancer set up their employer side (business information and documents) before switching roles. Returns the existing profile when there is one.
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employer profile
 *       404:
 *         description: User not found
 */
router.post('/profile', authMiddleware, requireRole('employer', 'freelancer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await ensureEmployerProfile(userId);
  if (!result.success) {
    sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/employers/profile/completeness:
 *   get:
 *     summary: Check whether the employer's business profile is complete
 *     description: Lists missing required business fields and documents. Posting a project requires a complete business profile.
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Completeness result
 *       404:
 *         description: Profile not found
 */
router.get('/profile/completeness', authMiddleware, requireRole('employer', 'freelancer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getBusinessProfileCompleteness(userId);
  if (!result.success) {
    sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/employers/profile/documents:
 *   get:
 *     summary: List the current employer's business documents
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business documents
 *   post:
 *     summary: Upload a business document
 *     description: Uploads one PDF or image (max 10MB). Uploading a type that already exists replaces it, except for "other". Documents are collected for transparency and are not checked against BIR, DTI or SEC records.
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Document uploaded
 *       400:
 *         description: Validation error
 */
router.get('/profile/documents', authMiddleware, requireRole('employer', 'freelancer'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const documents = await listBusinessDocuments(userId);
  res.status(200).json({ documents });
}));

router.post('/profile/documents', authMiddleware, requireRole('employer', 'freelancer'), fileUploadRateLimiter, uploadBusinessDocumentMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const { documentType, label } = req.body as { documentType?: unknown; label?: unknown };
  const errors: FieldError[] = [];
  if (!(BUSINESS_DOCUMENT_TYPES as readonly unknown[]).includes(documentType)) {
    errors.push({ field: 'documentType', message: `Document type must be one of: ${BUSINESS_DOCUMENT_TYPES.join(', ')}` });
  }
  if (documentType === 'other' && (!isNonEmptyString(label, 2) || label.length > 255)) {
    errors.push({ field: 'label', message: 'Label must be 2 to 255 characters for "other" documents' });
  }
  if (errors.length > 0) {
    sendValidationError(res, errors, requestId);
    return;
  }

  const file = (req.files as Express.Multer.File[])[0] as Express.Multer.File & { detectedMimeType?: string };
  const result = await uploadBusinessDocument(userId, {
    documentType: documentType as BusinessDocumentType,
    label: typeof label === 'string' ? label : undefined,
    buffer: file.buffer,
    originalFilename: file.originalname,
    mimeType: file.detectedMimeType || file.mimetype,
  });

  if (!result.success) {
    const statusCode = result.error.code === 'PROFILE_NOT_FOUND' ? 404 : 500;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(201).json(result.data);
}));

/**
 * @swagger
 * /api/employers/profile/documents/{documentId}:
 *   delete:
 *     summary: Delete one of the current employer's business documents
 *     tags:
 *       - Employers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document deleted
 *       403:
 *         description: Not the owner
 *       404:
 *         description: Document not found
 */
router.delete('/profile/documents/:documentId', authMiddleware, requireRole('employer', 'freelancer'), apiRateLimiter, validateAppwriteDocumentId(['documentId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await deleteBusinessDocument(userId, req.params['documentId'] ?? '');
  if (!result.success) {
    const statusCode = result.error.code === 'FORBIDDEN' ? 403 : 404;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/employers/{id}:
 *   get:
 *     summary: Get employer profile by user ID
 *     description: Retrieves an employer's public profile
 *     tags:
 *       - Employers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID of the employer (UUID)
 *     responses:
 *       200:
 *         description: Employer profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmployerProfile'
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: Profile not found
 */
router.get('/:id', optionalAuthMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  const result = await getEmployerProfileByUserId(id);

  if (!result.success) {
    sendErrorResponse(res, 404, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(req.user ? result.data : redactPrivateBusinessFields(result.data));
}));

/**
 * @swagger
 * /api/employers/{id}/documents:
 *   get:
 *     summary: List an employer's business documents
 *     description: Lists the business documents an employer has on file. File URLs are only included for signed-in users. Documents are collected for transparency and are not checked against BIR, DTI or SEC records.
 *     tags:
 *       - Employers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Business documents on file
 */
router.get('/:id/documents', optionalAuthMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const documents = await listBusinessDocuments(id);
  const visible = req.user
    ? documents
    : documents.map(({ fileUrl: _fileUrl, fileName: _fileName, ...rest }) => rest);
  res.status(200).json({ documents: visible });
}));

export default router;

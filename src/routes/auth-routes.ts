import { Router, Request, Response } from 'express';
import {
  register,
  login,
  refreshTokens,
  validatePasswordStrength,
  loginWithAppwrite,
  registerWithAppwrite,
  getOAuthUrl,
  exchangeCodeForSession,
  resendConfirmationEmail,
  requestPasswordReset,
  updatePassword,
  getCurrentUserWithKyc,
  logout,
  enrollMFA,
  verifyMFAEnrollment,
  challengeMFA,
  verifyMFAChallenge,
  getMFAFactors,
  disableMFA,
  validateTokenAndGetUser,
  requestEmailOtp,
  requestMagicUrl,
  verifyAuthToken,
} from '../services/auth-service.js';
import { RegisterInput, LoginInput, MfaRequiredResult, isAuthError } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import { authRateLimiter, registerRateLimiter, passwordResetRateLimiter, mfaVerifyRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { logger } from '../config/logger.js';
import { generateCsrfToken } from '../middleware/csrf-middleware.js';
import { userRepository } from '../repositories/user-repository.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendValidationError, sendErrorResponse } from '../utils/response-helpers.js';

const router = Router();

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

function extractBearerToken(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader?.split(' ')[1];
  if (!token) {
    sendErrorResponse(res, 401, 'AUTH_MISSING_TOKEN', 'Authorization token is required', getRequestId(req));
    return null;
  }
  return token;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterInput:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - role
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         password:
 *           type: string
 *           minLength: 8
 *           description: User's password (min 8 characters)
 *         role:
 *           type: string
 *           enum: [freelancer, employer]
 *           description: User's role on the platform
 *     LoginInput:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *     RefreshInput:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: The refresh token
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthResult:
 *       type: object
 *       properties:
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             email:
 *               type: string
 *             role:
 *               type: string
 *               enum: [freelancer, employer, admin]
 *             walletAddress:
 *               type: string
 *             createdAt:
 *               type: string
 *               format: date-time
 *         accessToken:
 *           type: string
 *         refreshToken:
 *           type: string
 *     AuthError:
 *       type: object
 *       properties:
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *             message:
 *               type: string
 *         timestamp:
 *           type: string
 *           format: date-time
 *         requestId:
 *           type: string
 */

/**
 * Validate email format
 * Now checks for proper local@domain.tld format with maximum length
 */
function validateEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  if (email.length < 5 || email.length > 254) return false;
  // RFC 5322 simplified: local-part@domain.tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateRole(role: unknown): role is UserRole {
  return role === 'freelancer' || role === 'employer';
}

// ── Reusable validation helpers ────────────────────────────────

type ValidationError = { field: string; message: string };

function validateRegisterInput(body: unknown): { valid: boolean; errors: ValidationError[]; input?: RegisterInput } {
  const { email, password, role } = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!validateEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  if (typeof password === 'string') {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      passwordValidation.errors.forEach(err => errors.push({ field: 'password', message: err }));
    }
  } else {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (!validateRole(role)) {
    errors.push({ field: 'role', message: 'Role must be freelancer or employer' });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], input: { email: email as string, password: password as string, role: role as UserRole } };
}

function validateLoginInput(body: unknown): { valid: boolean; errors: ValidationError[]; input?: LoginInput } {
  const { email, password } = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!validateEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], input: { email: email as string, password: password as string } };
}

function validatePasswordResetInput(body: unknown): { valid: boolean; errors: ValidationError[]; accessToken?: string; password?: string } {
  const { accessToken, password } = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!accessToken || typeof accessToken !== 'string') {
    errors.push({ field: 'accessToken', message: 'Access token is required' });
  }

  if (typeof password === 'string') {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      passwordValidation.errors.forEach(err => errors.push({ field: 'password', message: err }));
    }
  } else {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], accessToken: accessToken as string, password: password as string };
}


/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account and returns authentication tokens
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 */
router.post('/register', registerRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const validation = validateRegisterInput(req.body);

  if (!validation.valid) {
    sendValidationError(res, validation.errors, requestId);
    return;
  }

  const result = await register(validation.input!);

  if (isAuthError(result)) {
    // M5: Use generic error message to prevent email enumeration.
    const message = result.code === 'DUPLICATE_EMAIL'
      ? 'Registration failed. Please try again or use a different email.'
      : result.message;
    sendErrorResponse(res, 400, 'REGISTRATION_FAILED', message, requestId);
    return;
  }

  res.status(201).json(result);
}));


/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticates a user and returns JWT tokens
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 */
router.post('/login', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const validation = validateLoginInput(req.body);

  if (!validation.valid) {
    sendValidationError(res, validation.errors, requestId);
    return;
  }

  const result = await login(validation.input!);

  if (isAuthError(result)) {
    if (result.code === 'MFA_REQUIRED') {
      const mfaResult = result as MfaRequiredResult;
      res.status(200).json({
        mfaRequired: true,
        mfaSessionToken: mfaResult.mfaSessionToken,
      });
      return;
    }

    sendErrorResponse(res, 401, 'AUTH_INVALID_CREDENTIALS', result.message, requestId);
    return;
  }

  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/login/mfa-verify:
 *   post:
 *     summary: Complete MFA login
 *     description: Verifies MFA code and completes the login process
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessToken
 *               - factorId
 *               - code
 *             properties:
 *               accessToken:
 *                 type: string
 *               factorId:
 *                 type: string
 *               code:
 *                 type: string
 *                 description: 6-digit TOTP code
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       400:
 *         description: Invalid code
 *       401:
 *         description: Unauthorized
 */
router.post('/login/mfa-verify', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { mfaSessionToken, factorId, code } = req.body;
  const sessionToken = mfaSessionToken || req.body.accessToken;
  const requestId = getRequestId(req);

  if (!sessionToken || !factorId || !code) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'mfaSessionToken, factorId, and code are required', requestId);
    return;
  }

  const challengeResult = await challengeMFA(sessionToken, factorId);

  if (isAuthError(challengeResult)) {
    sendErrorResponse(res, 400, challengeResult.code, challengeResult.message, requestId);
    return;
  }

  const verifyResult = await verifyMFAChallenge(sessionToken, factorId, challengeResult.challengeId, code);

  if (isAuthError(verifyResult)) {
    sendErrorResponse(res, 400, verifyResult.code, verifyResult.message, requestId);
    return;
  }

  const authResult = await validateTokenAndGetUser(sessionToken);

  if (isAuthError(authResult)) {
    sendErrorResponse(res, 401, authResult.code, authResult.message, requestId);
    return;
  }

  res.status(200).json(authResult);
}));


/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh authentication tokens
 *     description: Uses a refresh token to obtain new access and refresh tokens
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshInput'
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 */
router.post('/refresh', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const requestId = getRequestId(req);

  if (!refreshToken || typeof refreshToken !== 'string') {
    sendValidationError(res, [{ field: 'refreshToken', message: 'Refresh token is required' }], requestId);
    return;
  }

  const result = await refreshTokens(refreshToken);

  if (isAuthError(result)) {
    const statusCode = result.code === 'TOKEN_EXPIRED' ? 401 : 400;
    const code = result.code === 'TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN';
    sendErrorResponse(res, statusCode, code, result.message, requestId);
    return;
  }

  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/callback:
 *   get:
 *     summary: OAuth callback endpoint
 *     description: Handles OAuth redirect. For PKCE flow (code in query), exchanges code for tokens. For implicit flow (tokens in fragment), extracts and processes tokens.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Authorization code (PKCE flow)
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: Error code if OAuth failed
 *     responses:
 *       200:
 *         description: Success with tokens
 *       202:
 *         description: Registration required
 *       400:
 *         description: OAuth error
 *       401:
 *         description: Authentication failed
 */
router.get('/callback', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query;
  const requestId = getRequestId(req);

  if (error) {
    res.status(400).json({
      success: false,
      error: { code: 'OAUTH_ERROR', message: error_description || error },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (code && typeof code === 'string') {
    const sessionResult = await exchangeCodeForSession(code);

    if ('code' in sessionResult) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_EXCHANGE_FAILED', message: sessionResult.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    const result = await loginWithAppwrite(sessionResult.accessToken);

    if (isAuthError(result)) {
      if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
        res.status(202).json({
          success: true,
          status: 'registration_required',
          message: 'User does not exist. Please register with a role.',
          access_token: sessionResult.accessToken, // pass this to frontend so they can call /oauth/register
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: { code: 'AUTH_INVALID_TOKEN', message: result.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    res.status(200).json({
      success: true,
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
    });
    return;
  }

  // Implicit flow: serve HTML to extract tokens from URL fragment and POST to callback
  // Uses textContent (not document.write) to prevent XSS via untrusted fragment data
  /* istanbul ignore next */
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<pre id="result">Processing OAuth callback...</pre>
<script>
(function(){
  var el=document.getElementById('result');
  try{
    var p=new URLSearchParams(location.hash.slice(1));
    var t=p.get('access_token'),r=p.get('refresh_token');
    if(!t){el.textContent=JSON.stringify({success:false,error:'No tokens found in URL fragment'},null,2);return;}
    fetch('/api/auth/oauth/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:t})})
      .then(function(resp){return resp.json();})
      .then(function(d){el.textContent=JSON.stringify(d,null,2);})
      .catch(function(e){el.textContent=JSON.stringify({success:false,error:e.message},null,2);});
  }catch(e){el.textContent=JSON.stringify({success:false,error:'Failed to process OAuth callback'},null,2);}
})();
</script></body></html>`);
}));

/**
 * @swagger
 * /api/auth/oauth/register:
 *   post:
 *     summary: Complete OAuth registration
 *     description: Finalizes OAuth registration by providing a role.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessToken
 *               - role
 *             properties:
 *               accessToken:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully registered
 *       400:
 *         description: Validation error
 */
router.post('/oauth/register', registerRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, role } = req.body;
  const requestId = getRequestId(req);

  if (!accessToken || typeof accessToken !== 'string') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'accessToken is required', requestId);
    return;
  }
  if (!validateRole(role)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid role is required (freelancer or employer)', requestId);
    return;
  }

  const result = await registerWithAppwrite(accessToken, role);

  if (isAuthError(result)) {
    const status = result.code === 'AUTH_INVALID_TOKEN' ? 401 : 400;
    sendErrorResponse(res, status, result.code, result.message, requestId);
    return;
  }

  res.status(201).json(result);
}));

/**
 * @swagger
 * /api/auth/login/email-otp:
 *   post:
 *     summary: Request Email OTP
 *     tags: [Authentication]
 */
router.post('/login/email-otp', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const requestId = getRequestId(req);
  if (!email || !validateEmail(email)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', requestId);
    return;
  }
  const result = await requestEmailOtp(email);
  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }
  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/login/magic-url:
 *   post:
 *     summary: Request Magic URL
 *     tags: [Authentication]
 */
router.post('/login/magic-url', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const requestId = getRequestId(req);
  if (!email || !validateEmail(email)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', requestId);
    return;
  }
  const result = await requestMagicUrl(email);
  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }
  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/login/verify-token:
 *   post:
 *     summary: Verify token (Phone, Email OTP, or Magic URL)
 *     tags: [Authentication]
 */
router.post('/login/verify-token', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { userId, secret } = req.body;
  const requestId = getRequestId(req);
  if (!userId || !secret) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'userId and secret are required', requestId);
    return;
  }
  const result = await verifyAuthToken(userId, secret);
  if (isAuthError(result)) {
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      res.status(202).json({
        success: true,
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        access_token: secret,
      });
      return;
    }
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }
  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/oauth-login:
 *   post:
 *     summary: Login with Appwrite OAuth
 *     description: Authenticates a user using a Appwrite access token calling our backend to sync user and get app tokens
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessToken
 *             properties:
 *               accessToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       401:
 *         description: Invalid or expired token
 */
/**
 * @swagger
 * /api/auth/oauth/{provider}:
 *   get:
 *     summary: Initiate OAuth flow
 *     description: Redirects to Appwrite OAuth provider
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, github]
 *     responses:
 *       302:
 *         description: Redirect to provider
 */
router.get('/oauth/:provider', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { provider } = req.params as { provider: string };
  const requestId = getRequestId(req);

  try {
    if (!['google', 'github'].includes(provider)) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid provider', requestId);
      return;
    }

    // Role selection happens after callback, not here
    const url = await getOAuthUrl(provider);
    res.redirect(url);
  } catch {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to initiate OAuth flow',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}));

/**
 * @swagger
 * /api/auth/oauth/callback:
 *   post:
 *     summary: OAuth token callback (for implicit flow)
 *     description: Receives access_token from frontend after OAuth redirect (when tokens are in URL fragment)
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - access_token
 *             properties:
 *               access_token:
 *                 type: string
 *                 description: Appwrite access token from OAuth redirect
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       202:
 *         description: Registration required
 *       401:
 *         description: Invalid token
 */
router.post('/oauth/callback', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { access_token } = req.body;
  const requestId = getRequestId(req);

  logger.debug('OAuth callback received', { requestId });

  if (!access_token || typeof access_token !== 'string') {
    logger.warn('OAuth callback missing access_token', { requestId });
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'access_token is required', requestId);
    return;
  }

  logger.debug('Calling loginWithAppwrite', { requestId });
  const result = await loginWithAppwrite(access_token);

  if (isAuthError(result)) {
    logger.info('OAuth authentication error', {
      requestId,
      errorCode: result.code,
    });

    if (result.code === 'MFA_REQUIRED') {
      logger.info('OAuth user requires MFA', { requestId });
      const mfaResult = result as MfaRequiredResult;
      res.status(200).json({
        mfaRequired: true,
        mfaSessionToken: mfaResult.mfaSessionToken,
      });
      return;
    }
    
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      logger.info('OAuth user requires registration', { requestId });
      res.status(202).json({
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
      });
      return;
    }

    logger.warn('OAuth authentication failed', {
      requestId,
      errorCode: result.code,
    });

    sendErrorResponse(res, 401, 'AUTH_INVALID_TOKEN', result.message || 'Invalid token', requestId);
    return;
  }

  logger.info('OAuth authentication successful', {
    requestId,
    userId: result.user.id,
  });

  res.status(200).json(result);
}));


/**
 * @swagger
 * /api/auth/resend-confirmation:
 *   post:
 *     summary: Resend confirmation email
 *     description: Resends the email verification link to the user
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Confirmation email sent
 *       400:
 *         description: Validation error
 */
router.post('/resend-confirmation', passwordResetRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const requestId = getRequestId(req);

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', requestId);
    return;
  }

  const result = await resendConfirmationEmail(email);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }

  res.status(200).json({ message: 'Confirmation email sent' });
}));

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Sends a password reset email to the user
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       400:
 *         description: Validation error
 */
router.post('/forgot-password', passwordResetRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const requestId = getRequestId(req);

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', requestId);
    return;
  }

  // Prevent account enumeration: always return success regardless of whether email exists
  try {
    await requestPasswordReset(email);
  } catch {
    logger.info('Password reset request processed (email may not exist)', { requestId });
  }

  res.status(200).json({
    message: 'If this email is registered, a password reset link has been sent',
    timestamp: new Date().toISOString(),
    requestId,
  });
}));

/**
 * @swagger
 * /api/auth/csrf-token:
 *   get:
 *     summary: Get CSRF token
 *     description: Returns a CSRF token for use in subsequent state-changing requests
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: CSRF token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 csrfToken:
 *                   type: string
 *                   description: CSRF token to include in X-CSRF-Token header
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 requestId:
 *                   type: string
 *       500:
 *         description: Failed to generate token
 */
router.post('/csrf-token', authRateLimiter, (req: Request, res: Response) => {
  generateCsrfToken(req, res);
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     description: Updates the user password using the reset token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessToken
 *               - password
 *             properties:
 *               accessToken:
 *                 type: string
 *                 description: Access token from password reset email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid token
 */
router.post('/reset-password', passwordResetRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const validation = validatePasswordResetInput(req.body);

  if (!validation.valid) {
    sendValidationError(res, validation.errors, requestId);
    return;
  }

  const result = await updatePassword(validation.accessToken!, validation.password!);

  if (isAuthError(result)) {
    const statusCode = result.code === 'INVALID_TOKEN' ? 401 : 500;
    sendErrorResponse(res, statusCode, result.code, result.message, requestId);
    return;
  }

  res.status(200).json({ message: 'Password updated successfully' });
}));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Invalidates the current user session and tokens
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logout successful
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/logout', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const userId = req.user?.userId;

  logger.info('User logout initiated', { userId, requestId });

  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  const result = await logout(accessToken);

  if (isAuthError(result)) {
    logger.error('Logout failed', { userId, requestId, error: result.message });
    sendErrorResponse(res, 500, result.code, result.message, requestId);
    return;
  }

  logger.info('User logout successful', { userId, requestId });
  res.status(200).json({ message: 'Logout successful' });
}));

/**
 * @swagger
 * /api/auth/mfa/enroll:
 *   post:
 *     summary: Enroll MFA for user
 *     description: Initiates MFA enrollment via Email OTP
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA enrollment initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
router.post('/mfa/enroll', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const token = extractBearerToken(req, res);
  if (!token) return;

  const result = await enrollMFA(token);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }

  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/mfa/verify-enrollment:
 *   post:
 *     summary: Verify MFA enrollment
 *     description: Verifies the OTP code to complete MFA enrollment
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - factorId
 *               - code
 *             properties:
 *               factorId:
 *                 type: string
 *               code:
 *                 type: string
 *                 description: OTP code
 *     responses:
 *       200:
 *         description: MFA enrollment verified
 *       400:
 *         description: Invalid code
 *       401:
 *         description: Unauthorized
 */
router.post('/mfa/verify-enrollment', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { factorId, code } = req.body;
  const requestId = getRequestId(req);
  const token = extractBearerToken(req, res);
  if (!token) return;

  if (!factorId || !code) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId and code are required', requestId);
    return;
  }

  const result = await verifyMFAEnrollment(token, factorId, code);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }

  res.status(200).json({ message: 'MFA enrollment verified successfully' });
}));

/**
 * @swagger
 * /api/auth/mfa/challenge:
 *   post:
 *     summary: Create MFA challenge
 *     description: Creates an MFA challenge for login verification
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - factorId
 *             properties:
 *               factorId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Challenge created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 challengeId:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.post('/mfa/challenge', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { factorId } = req.body;
  const requestId = getRequestId(req);
  const token = extractBearerToken(req, res);
  if (!token) return;

  if (!factorId) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId is required', requestId);
    return;
  }

  const result = await challengeMFA(token, factorId);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }

  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/mfa/verify:
 *   post:
 *     summary: Verify MFA challenge
 *     description: Verifies the TOTP code for an MFA challenge
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - factorId
 *               - challengeId
 *               - code
 *             properties:
 *               factorId:
 *                 type: string
 *               challengeId:
 *                 type: string
 *               code:
 *                 type: string
 *                 description: 6-digit TOTP code
 *     responses:
 *       200:
 *         description: MFA verified successfully
 *       400:
 *         description: Invalid code
 *       401:
 *         description: Unauthorized
 */
router.post('/mfa/verify', authMiddleware, mfaVerifyRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { factorId, challengeId, code } = req.body;
  const requestId = getRequestId(req);
  const token = extractBearerToken(req, res);
  if (!token) return;

  if (!factorId || !challengeId || !code) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId, challengeId, and code are required', requestId);
    return;
  }

  const result = await verifyMFAChallenge(token, factorId, challengeId, code);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }

  res.status(200).json({ message: 'MFA verified successfully' });
}));

/**
 * @swagger
 * /api/auth/mfa/factors:
 *   get:
 *     summary: Get MFA factors
 *     description: Returns list of enrolled MFA factors for the user
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA factors retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 factors:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/mfa/factors', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const token = extractBearerToken(req, res);
  if (!token) return;

  const result = await getMFAFactors(token);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }

  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/mfa/disable:
 *   post:
 *     summary: Disable MFA
 *     description: Disables MFA for the user
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - factorId
 *             properties:
 *               factorId:
 *                 type: string
 *               otpCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: MFA disabled successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/mfa/disable', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { factorId, otpCode } = req.body;
  const requestId = getRequestId(req);
  const token = extractBearerToken(req, res);
  if (!token) return;

  if (!factorId) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId is required', requestId);
    return;
  }

  if (!otpCode || typeof otpCode !== 'string') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'otpCode is required for re-authentication', requestId);
    return;
  }

  const result = await disableMFA(token, factorId, otpCode);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, requestId);
    return;
  }

  res.status(200).json({ message: 'MFA disabled successfully' });
}));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Returns the authenticated user's information including KYC status
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     walletAddress:
 *                       type: string
 *                     kycStatus:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', requestId);
    return;
  }

  const result = await getCurrentUserWithKyc(userId);

  if (isAuthError(result)) {
    sendErrorResponse(res, 404, result.code, result.message, requestId);
    return;
  }

  res.status(200).json({ user: result });
}));

/**
 * @swagger
 * /api/auth/wallet:
 *   patch:
 *     tags:
 *       - Authentication
 *     summary: Update wallet address
 *     description: Updates the authenticated user's wallet address
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Ethereum wallet address
 *                 example: "0x1234567890123456789012345678901234567890"
 *     responses:
 *       200:
 *         description: Wallet address updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Wallet address updated successfully"
 *                 walletAddress:
 *                   type: string
 *                   example: "0x1234567890123456789012345678901234567890"
 *       400:
 *         description: Invalid wallet address format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.patch('/wallet', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { walletAddress } = req.body;
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Wallet address is required', requestId);
    return;
  }

  if (!WALLET_REGEX.test(walletAddress)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid Ethereum wallet address format', requestId);
    return;
  }

  try {
    const updatedUser = await userRepository.updateUser(userId, { wallet_address: walletAddress });

    if (!updatedUser) {
      sendErrorResponse(res, 404, 'USER_NOT_FOUND', 'User not found', requestId);
      return;
    }

    res.status(200).json({
      message: 'Wallet address updated successfully',
      walletAddress: updatedUser.wallet_address,
      timestamp: new Date().toISOString(),
      requestId,
    });
  } catch (error) {
    logger.error('Failed to update wallet address:', error);
    sendErrorResponse(res, 500, 'UPDATE_FAILED', 'Failed to update wallet address', requestId);
  }
}));

export default router;

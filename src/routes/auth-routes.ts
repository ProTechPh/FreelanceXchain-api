import { Router, Request, Response } from 'express';
import {
  register,
  login,
  refreshTokens,
  loginWithAppwrite,
  registerWithAppwrite,
  getOAuthUrl,
  exchangeCodeForSession,
  resendConfirmationEmail,
  verifyEmail,
  requestPasswordReset,
  resetPasswordWithRecovery,
  updatePassword,
  changePassword,
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
  updateUserWallet,
  disconnectUserWallet,
  deleteUserAccount,
  isAuthError,
} from '../services/auth-service.js';
import type { AuthResult, AuthError, MfaRequiredResult } from '../services/auth-types.js';
import { authRateLimiter, registerRateLimiter, passwordResetRateLimiter, mfaVerifyRateLimiter } from '../middleware/rate-limiter.js';
import { requireTurnstile } from '../middleware/turnstile-middleware.js';
import { getRequestId } from '../utils/route-helpers.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { generateCsrfToken } from '../middleware/csrf-middleware.js';
import {
  validateEmail,
  validateRole,
  validateRegisterInput,
  validateLoginInput,
  validatePasswordResetInput,
  validateChangePasswordInput,
  WALLET_REGEX,
} from '../validators/auth.schema.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendValidationError, sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import { getErrorMessage } from '../utils/index.js';
import { auditLogRepository } from '../repositories/audit-log-repository.js';
import { setAuthCookies, clearAuthCookies, extractTokenFromRequest } from '../utils/auth-cookie-helpers.js';
import { getAllowedOrigins, validateCorsOrigin } from '../middleware/security-middleware.js';

const router = Router();

function extractClientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0]?.trim() || req.ip || null
    : Array.isArray(forwarded)
    ? forwarded[0]?.trim() || req.ip || null
    : req.ip || null;
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
  return { ip, userAgent };
}

function extractBearerToken(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader?.split(' ')[1] || extractTokenFromRequest(req);
  if (!token) {
    sendErrorResponse(res, 401, 'AUTH_MISSING_TOKEN', 'Authorization token is required', { requestId: getRequestId(req) });
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
router.post('/register', registerRateLimiter, requireTurnstile('signup'), asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const validation = validateRegisterInput(req.body);

  if (!validation.valid) {
    sendValidationError(res, validation.errors, requestId);
    return;
  }

  const result = await register(validation.input!);

  if (isAuthError(result)) {
    const message = result.code === 'DUPLICATE_EMAIL'
      ? 'An account with this email already exists. Please sign in or use a different email.'
      : result.message;
    sendErrorResponse(res, 400, 'REGISTRATION_FAILED', message, { requestId });
    return;
  }

  const { ip, userAgent } = extractClientInfo(req);
  void auditLogRepository.create({
    user_id: result.user.id,
    actor_id: result.user.id,
    action: 'auth.register',
    resource_type: 'user',
    resource_id: result.user.id,
    payload: { email: result.user.email, role: result.user.role },
    ip_address: ip,
    user_agent: userAgent,
    status: 'success',
    error_message: null,
  });

  if (result.accessToken) {
    setAuthCookies(res, result.accessToken, result.refreshToken);
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
router.post('/login', authRateLimiter, requireTurnstile('login'), asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const validation = validateLoginInput(req.body);

  if (!validation.valid) {
    sendValidationError(res, validation.errors, requestId);
    return;
  }

  const result = await login(validation.input!);
  const { ip, userAgent } = extractClientInfo(req);

  if (isAuthError(result)) {
    if (result.code === 'MFA_REQUIRED') {
      const mfaResult = result as MfaRequiredResult;
      sendSuccessResponse(res, 200, {
        mfaRequired: true,
        mfaSessionToken: mfaResult.mfaSessionToken,
      }, requestId);
      return;
    }

    void auditLogRepository.create({
      user_id: null,
      actor_id: null,
      action: 'auth.login_failed',
      resource_type: 'user',
      resource_id: null,
      payload: { email: validation.input!.email },
      ip_address: ip,
      user_agent: userAgent,
      status: 'failure',
      error_message: result.message || 'Invalid email or password',
    });

    if (result.code === 'EMAIL_NOT_VERIFIED') {
      sendErrorResponse(res, 403, 'EMAIL_NOT_VERIFIED', result.message, { requestId });
      return;
    }

    sendErrorResponse(res, 401, 'AUTH_INVALID_CREDENTIALS', result.message, { requestId });
    return;
  }

  void auditLogRepository.create({
    user_id: result.user.id,
    actor_id: result.user.id,
    action: 'auth.login',
    resource_type: 'user',
    resource_id: result.user.id,
    payload: { email: result.user.email, role: result.user.role },
    ip_address: ip,
    user_agent: userAgent,
    status: 'success',
    error_message: null,
  });

  if (result.accessToken) {
    setAuthCookies(res, result.accessToken, result.refreshToken);
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'mfaSessionToken, factorId, and code are required', { requestId });
    return;
  }

  const challengeResult = await challengeMFA(sessionToken, factorId);

  if (isAuthError(challengeResult)) {
    sendErrorResponse(res, 400, challengeResult.code, challengeResult.message, { requestId });
    return;
  }

  const verifyResult = await verifyMFAChallenge(sessionToken, factorId, challengeResult.challengeId, code);

  if (isAuthError(verifyResult)) {
    sendErrorResponse(res, 400, verifyResult.code, verifyResult.message, { requestId });
    return;
  }

  const authResult = await validateTokenAndGetUser(sessionToken);

  if (isAuthError(authResult)) {
    sendErrorResponse(res, 401, authResult.code, authResult.message, { requestId });
    return;
  }

  if (authResult.accessToken) {
    setAuthCookies(res, authResult.accessToken, authResult.refreshToken);
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
  const cookieRefreshToken = req.cookies
    ? req.cookies['refresh_token'] || req.cookies['__Host-psifi.refresh-token'] || req.cookies['psifi.refresh-token']
    : undefined;
  const refreshToken = req.body?.refreshToken || cookieRefreshToken;
  const requestId = getRequestId(req);

  if (!refreshToken || typeof refreshToken !== 'string') {
    sendValidationError(res, [{ field: 'refreshToken', message: 'Refresh token is required' }], requestId);
    return;
  }

  const result = await refreshTokens(refreshToken);

  if (isAuthError(result)) {
    const statusCode = result.code === 'TOKEN_EXPIRED' ? 401 : 400;
    const code = result.code === 'TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN';
    sendErrorResponse(res, statusCode, code, result.message, { requestId });
    return;
  }

  if (result.accessToken) {
    setAuthCookies(res, result.accessToken, result.refreshToken);
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
async function handleTokenCallback(
  res: Response,
  userId: string,
  secret: string,
  requestId: string
): Promise<void> {
  const result = await verifyAuthToken(userId, secret);
  if (isAuthError(result)) {
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      sendSuccessResponse(res, 202, {
        success: true,
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        access_token: (result as { accessToken?: string }).accessToken || secret,
      }, requestId);
      return;
    }
    sendErrorResponse(res, 401, 'AUTH_INVALID_TOKEN', result.message, { requestId, success: false });
    return;
  }

  sendSuccessResponse(res, 200, {
    success: true,
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    user: result.user,
  }, requestId);
}

async function handleCodeCallback(
  res: Response,
  code: string,
  requestId: string
): Promise<void> {
  const sessionResult = await exchangeCodeForSession(code);

  if ('code' in sessionResult) {
    sendErrorResponse(res, 401, 'AUTH_EXCHANGE_FAILED', sessionResult.message, { requestId, success: false });
    return;
  }

  const result = await loginWithAppwrite(sessionResult.accessToken);

  if (isAuthError(result)) {
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      sendSuccessResponse(res, 202, {
        success: true,
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        access_token: sessionResult.accessToken,
      }, requestId);
      return;
    }

    sendErrorResponse(res, 401, 'AUTH_INVALID_TOKEN', result.message, { requestId, success: false });
    return;
  }

  sendSuccessResponse(res, 200, {
    success: true,
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    user: result.user,
  }, requestId);
}

function renderImplicitFlowHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
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
</script></body></html>`;
}

router.get('/callback', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { code, error, error_description, userId, secret } = req.query;
  const requestId = getRequestId(req);

  if (error) {
    sendErrorResponse(res, 400, 'OAUTH_ERROR', String(error_description || error), { requestId, success: false });
    return;
  }

  if (userId && secret && typeof userId === 'string' && typeof secret === 'string') {
    await handleTokenCallback(res, userId, secret, requestId);
    return;
  }

  if (code && typeof code === 'string') {
    await handleCodeCallback(res, code, requestId);
    return;
  }

  // Implicit flow: serve HTML to extract tokens from URL fragment and POST to callback
  // Uses textContent (not document.write) to prevent XSS via untrusted fragment data
  /* istanbul ignore next */
  res.send(renderImplicitFlowHtml());
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'accessToken is required', { requestId });
    return;
  }
  if (!validateRole(role)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid role is required (freelancer or employer)', { requestId });
    return;
  }

  const result = await registerWithAppwrite(accessToken, role);

  if (isAuthError(result)) {
    const status = result.code === 'AUTH_INVALID_TOKEN' ? 401 : 400;
    sendErrorResponse(res, status, result.code, result.message, { requestId });
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', { requestId });
    return;
  }
  const result = await requestEmailOtp(email);
  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', { requestId });
    return;
  }
  const result = await requestMagicUrl(email);
  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'userId and secret are required', { requestId });
    return;
  }
  const result = await verifyAuthToken(userId, secret);
  if (isAuthError(result)) {
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      sendSuccessResponse(res, 202, {
        success: true,
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        access_token: (result as { accessToken?: string }).accessToken || secret,
      }, requestId);
      return;
    }
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
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
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid provider', { requestId });
      return;
    }

    const customRedirect = typeof req.query['redirect_to'] === 'string' ? req.query['redirect_to'] : undefined;
    const url = await getOAuthUrl(provider, customRedirect);

    // If caller requested JSON (e.g. frontend API call), return JSON payload
    if (req.headers.accept?.includes('application/json') || req.query['format'] === 'json') {
      res.status(200).json({ url });
      return;
    }

    res.redirect(url);
  } catch (error: unknown) {
    logger.error('Failed to initiate OAuth flow', { requestId, provider, error: getErrorMessage(error) });
    
    // If browser navigation, redirect to frontend login with error query param
    if (req.headers.accept?.includes('text/html')) {
      const frontendUrl = config.server.frontendUrl || 'https://www.freelancexchain.works';
      res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Failed to initiate OAuth flow')}`);
      return;
    }

    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to initiate OAuth flow', { requestId });
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
  const { access_token, accessToken, userId, secret } = req.body;
  const token = access_token || accessToken || secret;
  const requestId = getRequestId(req);

  logger.debug('OAuth callback received', { requestId, hasUserId: !!userId, hasSecret: !!secret, hasToken: !!token });

  let result: AuthResult | (AuthError & { accessToken?: string }) | MfaRequiredResult;
  let sessionSecret = token;

  if (userId && (secret || token)) {
    const tokenSecret = (secret || token) as string;
    const verifyResult = await verifyAuthToken(userId, tokenSecret);
    if (isAuthError(verifyResult)) {
      if (verifyResult.code === 'AUTH_REQUIRE_REGISTRATION') {
        sessionSecret = verifyResult.accessToken || tokenSecret;
      }
      result = verifyResult;
    } else {
      sessionSecret = verifyResult.accessToken;
      result = verifyResult;
    }
  } else if (token && typeof token === 'string') {
    result = await loginWithAppwrite(token);
  } else {
    logger.warn('OAuth callback missing token/secret', { requestId });
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'access_token is required', { requestId });
    return;
  }

  if (isAuthError(result)) {
    logger.info('OAuth authentication error', {
      requestId,
      errorCode: result.code,
    });

    if (result.code === 'MFA_REQUIRED') {
      logger.info('OAuth user requires MFA', { requestId });
      const mfaResult = result as MfaRequiredResult;
      sendSuccessResponse(res, 200, {
        mfaRequired: true,
        mfaSessionToken: mfaResult.mfaSessionToken,
      }, requestId);
      return;
    }
    
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      logger.info('OAuth user requires registration', { requestId });
      sendSuccessResponse(res, 202, {
        success: true,
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        access_token: sessionSecret,
      }, requestId);
      return;
    }

    logger.warn('OAuth authentication failed', {
      requestId,
      errorCode: result.code,
    });

    sendErrorResponse(res, 401, 'AUTH_INVALID_TOKEN', result.message || 'Invalid token', { requestId });
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', { requestId });
    return;
  }

  const result = await resendConfirmationEmail(email);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Confirmation email sent' }, requestId);
}));

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email address
 *     description: Completes the email verification process using the token from the email link
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - secret
 *             properties:
 *               userId:
 *                 type: string
 *               secret:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired verification token
 */
router.post('/verify-email', passwordResetRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { userId, secret } = req.body;
  const requestId = getRequestId(req);

  if (!userId || typeof userId !== 'string' || !secret || typeof secret !== 'string') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'userId and secret are required', { requestId });
    return;
  }

  const result = await verifyEmail(userId.trim(), secret.trim());

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Email verified successfully' }, requestId);
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
router.post('/forgot-password', passwordResetRateLimiter, requireTurnstile('password_reset'), asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const requestId = getRequestId(req);

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid email is required', { requestId });
    return;
  }

  const rawOrigin = req.headers.origin || (typeof req.headers.referer === 'string' ? req.headers.referer : undefined);
  let customFrontendUrl: string | undefined;
  if (rawOrigin) {
    try {
      const parsedOrigin = new URL(rawOrigin).origin;
      if (validateCorsOrigin(parsedOrigin, getAllowedOrigins())) {
        customFrontendUrl = parsedOrigin;
      }
    } catch {
      // Ignore invalid URL format
    }
  }

  // Prevent account enumeration: always return success regardless of whether email exists
  try {
    await requestPasswordReset(email, customFrontendUrl);
  } catch {
    logger.info('Password reset request processed (email may not exist)', { requestId });
  }

  sendSuccessResponse(res, 200, {
    message: 'If this email is registered, a password reset link has been sent',
  }, requestId);
}));

/**
 * @swagger
 * /api/auth/csrf-token:
 *   post:
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
 *   get:
 *     summary: Get CSRF token
 *     description: Returns a CSRF token for use in subsequent state-changing requests
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: CSRF token generated successfully
 */
router.post('/csrf-token', authRateLimiter, (req: Request, res: Response) => {
  generateCsrfToken(req, res);
});
router.get('/csrf-token', authRateLimiter, (req: Request, res: Response) => {
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

  const result = validation.userId && (validation.secret || validation.accessToken)
    ? await resetPasswordWithRecovery(validation.userId, (validation.secret || validation.accessToken)!, validation.password!)
    : await updatePassword((validation.accessToken || validation.secret)!, validation.password!);

  if (isAuthError(result)) {
    const statusCode = result.code === 'INVALID_TOKEN' ? 401 : result.code === 'VALIDATION_ERROR' ? 400 : 500;
    sendErrorResponse(res, statusCode, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Password updated successfully' }, requestId);
}));

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     description: Changes password for the currently logged-in user after verifying current password. Invalidates all active sessions.
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
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error or incorrect current password
 *       401:
 *         description: Unauthorized
 */
router.post('/change-password', authMiddleware, passwordResetRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const validation = validateChangePasswordInput(req.body);

  if (!validation.valid) {
    sendValidationError(res, validation.errors, requestId);
    return;
  }

  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (extractTokenFromRequest(req) || '');

  const result = await changePassword(accessToken, validation.currentPassword!, validation.newPassword!);

  if (isAuthError(result)) {
    const statusCode = result.code === 'INVALID_CREDENTIALS' || result.code === 'VALIDATION_ERROR' ? 400 : 500;
    sendErrorResponse(res, statusCode, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Password changed successfully. Please log in with your new password.' }, requestId);
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
    sendErrorResponse(res, 500, result.code, result.message, { requestId });
    return;
  }

  const { ip, userAgent } = extractClientInfo(req);
  if (userId) {
    void auditLogRepository.create({
      user_id: userId,
      actor_id: userId,
      action: 'auth.logout',
      resource_type: 'user',
      resource_id: userId,
      payload: { email: req.user?.email },
      ip_address: ip,
      user_agent: userAgent,
      status: 'success',
      error_message: null,
    });
  }

  clearAuthCookies(res);
  logger.info('User logout successful', { userId, requestId });
  sendSuccessResponse(res, 200, { message: 'Logout successful' }, requestId);
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
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId and code are required', { requestId });
    return;
  }

  const result = await verifyMFAEnrollment(token, factorId, code);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'MFA enrollment verified successfully' }, requestId);
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId is required', { requestId });
    return;
  }

  const result = await challengeMFA(token, factorId);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId, challengeId, and code are required', { requestId });
    return;
  }

  const result = await verifyMFAChallenge(token, factorId, challengeId, code);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'MFA verified successfully' }, requestId);
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
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
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
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'factorId is required', { requestId });
    return;
  }

  if (!otpCode || typeof otpCode !== 'string') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'otpCode is required for re-authentication', { requestId });
    return;
  }

  const result = await disableMFA(token, factorId, otpCode);

  if (isAuthError(result)) {
    sendErrorResponse(res, 400, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'MFA disabled successfully' }, requestId);
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
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
    return;
  }

  const result = await getCurrentUserWithKyc(userId);

  if (isAuthError(result)) {
    sendErrorResponse(res, 404, result.code, result.message, { requestId });
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
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Wallet address is required', { requestId });
    return;
  }

  if (!WALLET_REGEX.test(walletAddress)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid Ethereum wallet address format', { requestId });
    return;
  }

  const result = await updateUserWallet(userId, walletAddress);

  if (isAuthError(result)) {
    const statusCode = result.code === 'USER_NOT_FOUND' ? 404 : result.code === 'WALLET_LOCKED' ? 409 : 500;
    sendErrorResponse(res, statusCode, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, {
    message: 'Wallet address updated successfully',
    walletAddress: result.walletAddress,
  }, requestId);
}));

/**
 * @swagger
 * /api/auth/wallet:
 *   delete:
 *     tags:
 *       - Authentication
 *     summary: Disconnect wallet address
 *     description: Removes the associated wallet address from the user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet address disconnected successfully
 *       400:
 *         description: Cannot disconnect wallet due to active contracts
 *       401:
 *         description: Unauthorized
 */
router.delete('/wallet', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await disconnectUserWallet(userId);

  if (isAuthError(result)) {
    const statusCode = result.code === 'USER_NOT_FOUND' ? 404 : result.code === 'ACTIVE_CONTRACTS_EXIST' ? 400 : 500;
    sendErrorResponse(res, statusCode, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, {
    message: 'Wallet address disconnected successfully',
    walletAddress: '',
  }, requestId);
}));

/**
 * @swagger
 * /api/auth/account:
 *   delete:
 *     tags:
 *       - Authentication
 *     summary: Delete account
 *     description: Permanently deletes the user account and associated personal data (GDPR Right to Erasure)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account permanently deleted
 *       400:
 *         description: Cannot delete account due to active contracts
 *       401:
 *         description: Unauthorized
 */
router.delete('/account', authMiddleware, authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await deleteUserAccount(userId);

  if (isAuthError(result)) {
    const statusCode = result.code === 'USER_NOT_FOUND' ? 404 : result.code === 'ACTIVE_CONTRACTS_EXIST' ? 400 : 500;
    sendErrorResponse(res, statusCode, result.code, result.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, {
    message: result.message,
  }, requestId);
}));

export default router;

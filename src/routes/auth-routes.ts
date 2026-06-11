import { Router, Request, Response, NextFunction } from 'express';
import {
  register,
  login,
  refreshTokens,
  isAuthError,
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
  consumeMfaSession,
  validateTokenAndGetUser,
  requestPhoneOtp,
  requestEmailOtp,
  requestMagicUrl,
  verifyAuthToken,
} from '../services/auth-service.js';
import { RegisterInput, LoginInput, MfaRequiredResult } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import { authRateLimiter, registerRateLimiter, passwordResetRateLimiter, mfaVerifyRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { logger } from '../config/logger.js';
import { generateCsrfToken } from '../middleware/csrf-middleware.js';
import { userRepository } from '../repositories/user-repository.js';

const router = Router();

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Wraps async route handlers to catch unhandled rejections (Express 4 does not).
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function extractBearerToken(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader?.split(' ')[1];
  if (!token) {
    res.status(401).json({
      error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization token is required' },
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    });
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
  const { email, password, role } = req.body;
  const requestId = getRequestId(req);

  // Validate input
  const errors: { field: string; message: string }[] = [];

  if (!validateEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  // Password strength validation
  if (typeof password === 'string') {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      passwordValidation.errors.forEach(err => {
        errors.push({ field: 'password', message: err });
      });
    }
  } else {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (!validateRole(role)) {
    errors.push({ field: 'role', message: 'Role must be freelancer or employer' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const input: RegisterInput = { 
    email, 
    password, 
    role
  };
  const result = await register(input);

  if (isAuthError(result)) {
    const statusCode = result.code === 'DUPLICATE_EMAIL' ? 409 : 400;
    res.status(statusCode).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
  const { email, password } = req.body;
  const requestId = getRequestId(req);

  // Validate input
  const errors: { field: string; message: string }[] = [];

  if (!validateEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const input: LoginInput = { email, password };
  const result = await login(input);

  if (isAuthError(result)) {
    // Check if MFA is required
    if (result.code === 'MFA_REQUIRED') {
      const mfaResult = result as MfaRequiredResult;
      res.status(200).json({
        mfaRequired: true,
        mfaSessionId: mfaResult.mfaSessionId,
        factorId: mfaResult.factorId,
      });
      return;
    }
    
    res.status(401).json({
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
  const { mfaSessionId, factorId, code } = req.body;
  const requestId = getRequestId(req);

  if (!mfaSessionId || !factorId || !code) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'mfaSessionId, factorId, and code are required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Consume the pending MFA session to retrieve the real access token
  const mfaSession = await consumeMfaSession(mfaSessionId);

  if (!mfaSession) {
    res.status(401).json({
      error: {
        code: 'MFA_SESSION_EXPIRED',
        message: 'MFA session has expired or is invalid. Please log in again.',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const realAccessToken = mfaSession.accessToken;

  // Create challenge using the real access token
  const challengeResult = await challengeMFA(realAccessToken, factorId);
  
  if (isAuthError(challengeResult)) {
    res.status(400).json({
      error: {
        code: challengeResult.code,
        message: challengeResult.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Verify the code
  const verifyResult = await verifyMFAChallenge(realAccessToken, factorId, challengeResult.challengeId, code);
  
  if (isAuthError(verifyResult)) {
    res.status(400).json({
      error: {
        code: verifyResult.code,
        message: verifyResult.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // MFA verified - get user and return full auth result
  const authResult = await validateTokenAndGetUser(realAccessToken);
  
  if (isAuthError(authResult)) {
    res.status(401).json({
      error: {
        code: authResult.code,
        message: authResult.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Return the auth result with tokens from MFA session
  const finalResult = {
    ...authResult,
    refreshToken: mfaSession.refreshToken || authResult.refreshToken,
  };

  res.status(200).json(finalResult);
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
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Refresh token is required',
        details: [{ field: 'refreshToken', message: 'Refresh token is required' }],
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await refreshTokens(refreshToken);

  if (isAuthError(result)) {
    const statusCode = result.code === 'TOKEN_EXPIRED' ? 401 : 400;
    res.status(statusCode).json({
      error: {
        code: result.code === 'TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN',
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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

  // PKCE flow: code in query params
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

  // Implicit flow: tokens in URL fragment - serve minimal HTML to extract and POST to callback
  // Uses textContent instead of document.write to prevent XSS via untrusted URL fragment data
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
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'accessToken is required' }, timestamp: new Date().toISOString(), requestId });
    return;
  }
  if (!validateRole(role)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Valid role is required (freelancer or employer)' }, timestamp: new Date().toISOString(), requestId });
    return;
  }

  const result = await registerWithAppwrite(accessToken, role);

  if (isAuthError(result)) {
    const status = result.code === 'AUTH_INVALID_TOKEN' ? 401 : 400;
    res.status(status).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result);
}));

/**
 * @swagger
 * /api/auth/login/phone:
 *   post:
 *     summary: Request Phone OTP
 *     tags: [Authentication]
 */
router.post('/login/phone', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Phone is required' } });
    return;
  }
  const result = await requestPhoneOtp(phone);
  if (isAuthError(result)) {
    res.status(400).json({ error: result });
    return;
  }
  res.status(200).json(result);
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
  if (!email || !validateEmail(email)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' } });
    return;
  }
  const result = await requestEmailOtp(email);
  if (isAuthError(result)) {
    res.status(400).json({ error: result });
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
  if (!email || !validateEmail(email)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' } });
    return;
  }
  const result = await requestMagicUrl(email);
  if (isAuthError(result)) {
    res.status(400).json({ error: result });
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
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userId and secret are required' } });
    return;
  }
  const result = await verifyAuthToken(userId, secret);
  if (isAuthError(result)) {
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      res.status(202).json({
        success: true,
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        access_token: secret, // Use secret to register
      });
      return;
    }
    res.status(400).json({ error: result, requestId });
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
    // Valid provider check
    if (!['google', 'github'].includes(provider)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid provider',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    // Note: We no longer accept role here. Role selection happens AFTER callback.
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
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'access_token is required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  logger.debug('Calling loginWithAppwrite', { requestId });
  const result = await loginWithAppwrite(access_token);

  if (isAuthError(result)) {
    logger.info('OAuth authentication error', {
      requestId,
      errorCode: result.code,
    });
    
    // Check if MFA is required
    if (result.code === 'MFA_REQUIRED') {
      logger.info('OAuth user requires MFA', { requestId });
      const mfaResult = result as MfaRequiredResult;
      res.status(200).json({
        mfaRequired: true,
        mfaSessionId: mfaResult.mfaSessionId,
        factorId: mfaResult.factorId,
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
    
    res.status(401).json({
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: result.message || 'Invalid token',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  logger.info('OAuth authentication successful', {
    requestId,
    userId: result.user.id,
  });

  // Return the full auth result with user and tokens
  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/auth/oauth/register:
 *   post:
 *     summary: Complete OAuth registration with role
 *     description: Finalize account creation for a new OAuth user by providing a role and optionally wallet address
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
 *                 enum: [freelancer, employer]
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       400:
 *         description: Validation error or invalid role
 *       401:
 *         description: Invalid token
 */
router.post('/oauth/register', registerRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, role } = req.body;
  const requestId = getRequestId(req);

  const errors: { field: string; message: string }[] = [];

  if (!accessToken || typeof accessToken !== 'string') {
    errors.push({ field: 'accessToken', message: 'accessToken is required' });
  }

  if (!role || (role !== 'freelancer' && role !== 'employer')) {
    errors.push({ field: 'role', message: 'Valid role (freelancer or employer) is required' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  try {
    const result = await registerWithAppwrite(
      accessToken, 
      role
    );

    if (isAuthError(result)) {
      res.status(401).json({
        error: {
          code: 'AUTH_INVALID_TOKEN',
          message: result.message || 'Registration failed',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('OAuth registration error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during registration',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
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
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await resendConfirmationEmail(email);

  if (isAuthError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // This prevents account enumeration via timing/error differences
  try {
    await requestPasswordReset(email);
  } catch {
    // Swallow errors intentionally - don't reveal if the email exists
    logger.info('Password reset request processed (email may not exist)', { requestId });
  }

  // Always return success message regardless of whether email exists
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
  const { accessToken, password } = req.body;
  const requestId = getRequestId(req);

  const errors: { field: string; message: string }[] = [];

  if (!accessToken || typeof accessToken !== 'string') {
    errors.push({ field: 'accessToken', message: 'Access token is required' });
  }

  if (typeof password === 'string') {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      passwordValidation.errors.forEach(err => {
        errors.push({ field: 'password', message: err });
      });
    }
  } else {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updatePassword(accessToken, password);

  if (isAuthError(result)) {
    const statusCode = result.code === 'INVALID_TOKEN' ? 401 : 500;
    res.status(statusCode).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
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

  // Previously logout() was called with no arguments, signing out the server-side session
  // instead of the user's actual session
  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  const result = await logout(accessToken);

  if (isAuthError(result)) {
    logger.error('Logout failed', { userId, requestId, error: result.message });
    res.status(500).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'factorId and code are required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await verifyMFAEnrollment(token, factorId, code);

  if (isAuthError(result)) {
    res.status(400).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'factorId is required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await challengeMFA(token, factorId);

  if (isAuthError(result)) {
    res.status(400).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'factorId, challengeId, and code are required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await verifyMFAChallenge(token, factorId, challengeId, code);

  if (isAuthError(result)) {
    res.status(400).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'factorId is required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!otpCode || typeof otpCode !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'otpCode is required for re-authentication',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await disableMFA(token, factorId, otpCode);

  if (isAuthError(result)) {
    res.status(400).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(401).json({
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getCurrentUserWithKyc(userId);

  if (isAuthError(result)) {
    res.status(404).json({
      error: {
        code: result.code,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Validate wallet address format
  if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim() === '') {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Wallet address is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!WALLET_REGEX.test(walletAddress)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid Ethereum wallet address format' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  try {
    // Update wallet address in database
    const updatedUser = await userRepository.updateUser(userId, { wallet_address: walletAddress });
    
    if (!updatedUser) {
      res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        timestamp: new Date().toISOString(),
        requestId,
      });
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
    res.status(500).json({
      error: { code: 'UPDATE_FAILED', message: 'Failed to update wallet address' },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}));

export default router;

import { Router, Request, Response } from 'express';
import {
  register,
  login,
  refreshTokens,
  isAuthError,
  validatePasswordStrength,
  loginWithSupabase,
  registerWithSupabase,
  getOAuthUrl,
  exchangeCodeForSession,
  resendConfirmationEmail,
  requestPasswordReset,
  updatePassword,
  getCurrentUserWithKyc,
} from '../services/auth-service.js';
import { RegisterInput, LoginInput } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import { authRateLimiter } from '../middleware/rate-limiter.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

const router = Router();

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
 *         walletAddress:
 *           type: string
 *           pattern: ^0x[a-fA-F0-9]{40}$
 *           description: Optional Ethereum wallet address
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

function validateEmail(email: unknown): email is string {
  return typeof email === 'string' && email.includes('@') && email.length >= 5;
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
router.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  const { email, password, role, walletAddress } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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

  // Validate wallet address format if provided
  if (walletAddress && typeof walletAddress === 'string' && walletAddress.trim() !== '') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      errors.push({ field: 'walletAddress', message: 'Invalid Ethereum wallet address format' });
    }
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
    role, 
    walletAddress 
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
});


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
router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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
});


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
router.post('/refresh', authRateLimiter, async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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
    const statusCode = result.code === 'TOKEN_EXPIRED' ? 401 : 401;
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
});

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
router.get('/callback', async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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

    const result = await loginWithSupabase(sessionResult.accessToken);

    if (isAuthError(result)) {
      if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
        res.status(202).json({
          success: true,
          status: 'registration_required',
          message: 'User does not exist. Please register with a role.',
          access_token: sessionResult.accessToken,
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

  // Implicit flow: tokens in URL fragment - serve minimal HTML to extract and display as JSON
  res.send(`<script>
var p=new URLSearchParams(location.hash.slice(1));
var t=p.get('access_token'),r=p.get('refresh_token');
if(t){fetch('/api/auth/oauth/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:t})}).then(r=>r.json()).then(d=>document.write('<pre>'+JSON.stringify({success:true,access_token:t,refresh_token:r,...d},null,2)+'</pre>')).catch(e=>document.write(JSON.stringify({success:false,error:e.message})));}
else document.write(JSON.stringify({success:false,error:'No tokens found'}));
</script>`);
});

/**
 * @swagger
 * /api/auth/oauth-login:
 *   post:
 *     summary: Login with Supabase OAuth
 *     description: Authenticates a user using a Supabase access token calling our backend to sync user and get app tokens
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
 *     description: Redirects to Supabase OAuth provider
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, github, azure, linkedin]
 *     responses:
 *       302:
 *         description: Redirect to provider
 */
router.get('/oauth/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params as { provider: string };
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  try {
    // Valid provider check
    if (!['google', 'github', 'azure', 'linkedin'].includes(provider)) {
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
    const url = await getOAuthUrl(provider as any);
    res.redirect(url);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to initiate OAuth flow',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
});

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
 *                 description: Supabase access token from OAuth redirect
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
router.post('/oauth/callback', async (req: Request, res: Response) => {
  const { access_token } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  console.log('[OAuth] POST /oauth/callback - Received request');

  if (!access_token || typeof access_token !== 'string') {
    console.log('[OAuth] POST /oauth/callback - Missing access_token');
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

  console.log('[OAuth] POST /oauth/callback - Calling loginWithSupabase');
  const result = await loginWithSupabase(access_token);

  if (isAuthError(result)) {
    console.log('[OAuth] POST /oauth/callback - Got auth error:', result.code);
    
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      console.log('[OAuth] POST /oauth/callback - Returning 202 registration_required');
      res.status(202).json({
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        accessToken: access_token,
      });
      return;
    }

    console.log('[OAuth] POST /oauth/callback - Returning 401 invalid token');
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

  console.log('[OAuth] POST /oauth/callback - Success! Returning 200 with user data');
  // Return the full auth result with user and tokens
  res.status(200).json(result);
});

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
 *               walletAddress:
 *                 type: string
 *                 pattern: ^0x[a-fA-F0-9]{40}$
 *                 description: Optional Ethereum wallet address
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
router.post('/oauth/register', authRateLimiter, async (req: Request, res: Response) => {
  const { accessToken, role, walletAddress } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const errors: { field: string; message: string }[] = [];

  if (!accessToken || typeof accessToken !== 'string') {
    errors.push({ field: 'accessToken', message: 'accessToken is required' });
  }

  if (!role || (role !== 'freelancer' && role !== 'employer')) {
    errors.push({ field: 'role', message: 'Valid role (freelancer or employer) is required' });
  }

  // Validate wallet address format if provided
  if (walletAddress && typeof walletAddress === 'string' && walletAddress.trim() !== '') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      errors.push({ field: 'walletAddress', message: 'Invalid Ethereum wallet address format' });
    }
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
    const result = await registerWithSupabase(
      accessToken, 
      role, 
      walletAddress ?? ''
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
});

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
router.post('/resend-confirmation', authRateLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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
});

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
router.post('/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await requestPasswordReset(email);

  if (isAuthError(result)) {
    res.status(400).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({ message: 'Password reset email sent' });
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
router.post('/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  const { accessToken, password } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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
    res.status(401).json({
      error: { code: result.code, message: result.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({ message: 'Password updated successfully' });
});

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
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

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
});

export default router;

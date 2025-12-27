import { Router, Request, Response } from 'express';
import { register, login, refreshTokens, isAuthError, validatePasswordStrength, loginWithSupabase, registerWithSupabase, getOAuthUrl, exchangeCodeForSession } from '../services/auth-service.js';
import { RegisterInput, LoginInput } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import { authRateLimiter } from '../middleware/rate-limiter.js';

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
 *           description: Optional blockchain wallet address
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

  const input: RegisterInput = { email, password, role, walletAddress };
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
 * /api/auth/callback:
 *   get:
 *     summary: OAuth callback handler
 *     description: Handling the redirect from Supabase, exchanging code for tokens
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Login successful, returns tokens
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code } = req.query;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!code || typeof code !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Authorization code is required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // 1. Exchange code for Supabase Session
  const sessionResult = await exchangeCodeForSession(code);

  if (isAuthError(sessionResult as any)) {
    res.status(401).json({
      error: {
        code: 'AUTH_EXCHANGE_FAILED',
        message: (sessionResult as any).message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // 2. Login
  const accessToken = (sessionResult as { accessToken: string }).accessToken;
  const result = await loginWithSupabase(accessToken);

  if (isAuthError(result)) {
    // Check if registration is required
    if (result.code === 'AUTH_REQUIRE_REGISTRATION') {
      res.status(202).json({
        status: 'registration_required',
        message: 'User does not exist. Please register with a role.',
        accessToken, // Client needs this to call /register
      });
      return;
    }

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

  // Return the tokens directly. 
  // In a real browser app, we might redirect to a frontend page with tokens in URL hash 
  // or set HttpOnly cookies. Since the user asked for backend only, returning JSON is appropriate 
  // for testing via Postman/Curl or if the "frontend" is just a CLI or mobile app.
  res.status(200).json(result);
});


/**
 * @swagger
 * /api/auth/oauth/register:
 *   post:
 *     summary: Complete OAuth registration with role
 *     description: Finalize account creation for a new OAuth user by providing a role
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
router.post('/oauth/register', authRateLimiter, async (req: Request, res: Response) => {
  const { accessToken, role } = req.body;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!accessToken || typeof accessToken !== 'string') {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'accessToken is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!role || (role !== 'freelancer' && role !== 'employer')) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Valid role (freelancer or employer) is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  try {
    const result = await registerWithSupabase(accessToken, role);

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

export default router;

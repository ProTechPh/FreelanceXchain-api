import { Router, Request, Response } from 'express';
import { register, login, refreshTokens, isAuthError } from '../services/auth-service.js';
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

function validatePassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8;
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
  if (!validatePassword(password)) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
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
router.post('/refresh', async (req: Request, res: Response) => {
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

export default router;

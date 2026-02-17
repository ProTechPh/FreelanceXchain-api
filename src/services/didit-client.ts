/**
 * Didit KYC API Client
 * Handles all communication with Didit verification API
 */

import crypto from 'crypto';
import {
  DiditCreateSessionRequest,
  DiditCreateSessionResponse,
  DiditVerificationDecisionResponse,
  DiditApiError,
} from '../models/didit-kyc.js';
import { logger } from '../config/logger.js';
import { validateUrl, sanitizeSessionId } from '../utils/url-validator.js';

const DIDIT_API_KEY = process.env['DIDIT_API_KEY'];
const DIDIT_API_URL = process.env['DIDIT_API_URL'] ?? 'https://verification.didit.me';

if (!DIDIT_API_KEY) {
  logger.warn('DIDIT_API_KEY not configured. KYC verification will not work.');
}

// Validate the Didit API URL on startup
const urlValidation = validateUrl(DIDIT_API_URL);
if (!urlValidation.valid) {
  logger.error('Invalid DIDIT_API_URL configuration', undefined, {
    url: DIDIT_API_URL,
    error: urlValidation.error,
  });
  throw new Error(`Invalid DIDIT_API_URL: ${urlValidation.error}`);
}

type DiditClientResult<T> = { success: true; data: T } | { success: false; error: DiditApiError };

/**
 * Create a new verification session
 */
export async function createVerificationSession(
  request: DiditCreateSessionRequest
): Promise<DiditClientResult<DiditCreateSessionResponse>> {
  try {
    const response = await fetch(`${DIDIT_API_URL}/v2/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': DIDIT_API_KEY ?? '',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data as DiditApiError,
      };
    }

    return {
      success: true,
      data: data as DiditCreateSessionResponse,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to connect to Didit API',
        },
      },
    };
  }
}

/**
 * Retrieve verification decision for a session
 */
export async function getVerificationDecision(
  sessionId: string
): Promise<DiditClientResult<DiditVerificationDecisionResponse>> {
  try {
    // Sanitize session ID to prevent SSRF attacks
    const sanitizedSessionId = sanitizeSessionId(sessionId);
    
    const response = await fetch(`${DIDIT_API_URL}/v2/session/${sanitizedSessionId}/decision/`, {
      method: 'GET',
      headers: {
        'X-Api-Key': DIDIT_API_KEY ?? '',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Didit API returned error for verification decision', {
        sessionId: sanitizedSessionId,
        status: response.status,
      });
      
      return {
        success: false,
        error: data as DiditApiError,
      };
    }

    return {
      success: true,
      data: data as DiditVerificationDecisionResponse,
    };
  } catch (error) {
    logger.error('Failed to get verification decision', error as Error, {
      sessionId,
    });
    
    return {
      success: false,
      error: {
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to connect to Didit API',
        },
      },
    };
  }
}

export async function getVerificationSession(sessionId: string): Promise<DiditClientResult<DiditCreateSessionResponse>> {
  try {
    // Sanitize session ID to prevent SSRF attacks
    const sanitizedSessionId = sanitizeSessionId(sessionId);
    
    const response = await fetch(`${DIDIT_API_URL}/v2/session/${sanitizedSessionId}/`, {
      method: 'GET',
      headers: {
        'X-Api-Key': DIDIT_API_KEY ?? '',
      },
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      logger.error('Didit API returned non-JSON response', undefined, {
        sessionId: sanitizedSessionId,
        contentType,
        responsePreview: responseText.substring(0, 200),
      });
      
      return {
        success: false,
        error: {
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Didit API returned an invalid response. Please check your API configuration.',
          },
        },
      };
    }

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Didit API returned error for session details', {
        sessionId: sanitizedSessionId,
        status: response.status,
      });
      
      return {
        success: false,
        error: data as DiditApiError,
      };
    }

    return {
      success: true,
      data: data as DiditCreateSessionResponse,
    };
  } catch (error) {
    logger.error('Failed to get session details', error as Error, {
      sessionId,
    });
    
    return {
      success: false,
      error: {
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to connect to Didit API',
        },
      },
    };
  }
}

/**
 * Verify webhook signature from Didit
 * Uses HMAC-SHA256 with timestamp for replay protection
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  const secret = process.env['DIDIT_WEBHOOK_SECRET'];
  
  if (!secret) {
    logger.warn('DIDIT_WEBHOOK_SECRET not configured - skipping signature verification');
    return true; // Allow in development if not configured
  }

  if (!signature || !timestamp) {
    logger.warn('Missing signature or timestamp headers', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      nodeEnv: process.env['NODE_ENV'],
    });
    return process.env['NODE_ENV'] !== 'production';
  }

  // Verify timestamp is within 5 minutes to prevent replay attacks
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  const fiveMinutes = 5 * 60;
  
  if (Math.abs(now - timestampNum) > fiveMinutes) {
    logger.security('Webhook timestamp too old or in future', {
      timestamp: timestampNum,
      now,
      difference: Math.abs(now - timestampNum),
    });
    return false;
  }

  // Try different signature formats that Didit might use
  const possiblePayloads = [
    `${timestamp}${payload}`,           // timestamp + payload
    payload,                             // just payload
    `${timestamp}.${payload}`,           // timestamp.payload
  ];

  for (const signedPayload of possiblePayloads) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    try {
      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return true;
      }
    } catch {
      // Length mismatch, try next
    }
  }

  // Log signature verification failure
  logger.security('Webhook signature verification failed', {
    timestampAge: Math.abs(now - timestampNum),
  });
  
  return false;
}

/**
 * Didit KYC API Client
 * Handles all communication with Didit verification API
 */

import {
  DiditCreateSessionRequest,
  DiditCreateSessionResponse,
  DiditVerificationDecisionResponse,
  DiditApiError,
} from '../models/didit-kyc.js';

const DIDIT_API_KEY = process.env['DIDIT_API_KEY'];
const DIDIT_API_URL = process.env['DIDIT_API_URL'] ?? 'https://verification.didit.me';

if (!DIDIT_API_KEY) {
  console.warn('DIDIT_API_KEY not configured. KYC verification will not work.');
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
    const response = await fetch(`${DIDIT_API_URL}/v2/session/${sessionId}/decision/`, {
      method: 'GET',
      headers: {
        'X-Api-Key': DIDIT_API_KEY ?? '',
      },
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
      data: data as DiditVerificationDecisionResponse,
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
 * Retrieve session details
 */
export async function getSessionDetails(
  sessionId: string
): Promise<DiditClientResult<DiditCreateSessionResponse>> {
  try {
    const response = await fetch(`${DIDIT_API_URL}/v2/session/${sessionId}/`, {
      method: 'GET',
      headers: {
        'X-Api-Key': DIDIT_API_KEY ?? '',
      },
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
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const crypto = require('crypto');
  const secret = process.env['DIDIT_WEBHOOK_SECRET'];
  
  if (!secret) {
    console.error('DIDIT_WEBHOOK_SECRET not configured');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

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

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      logger.error('Didit API returned non-JSON response for session creation', undefined, {
        contentType,
        status: response.status,
        responsePreview: responseText.substring(0, 200),
      });
      return {
        success: false,
        error: {
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Didit API returned an invalid response format.',
          },
        },
      };
    }

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

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      logger.error('Didit API returned non-JSON response for verification decision', undefined, {
        sessionId: sanitizedSessionId,
        contentType,
        status: response.status,
        responsePreview: responseText.substring(0, 200),
      });
      return {
        success: false,
        error: {
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Didit API returned an invalid response format.',
          },
        },
      };
    }

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
  const allowInsecureDevWebhooks = process.env['ALLOW_INSECURE_DIDIT_WEBHOOKS'] === 'true';
  
  if (!secret) {
    if (allowInsecureDevWebhooks && process.env['NODE_ENV'] !== 'production') {
      logger.warn('DIDIT_WEBHOOK_SECRET not configured - insecure webhook bypass enabled for development');
      return true;
    }

    logger.security('DIDIT_WEBHOOK_SECRET not configured - rejecting webhook', {
      nodeEnv: process.env['NODE_ENV'],
    });
    return false;
  }

  if (!signature || !timestamp) {
    logger.warn('Missing signature or timestamp headers', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      nodeEnv: process.env['NODE_ENV'],
    });
    // This prevents trivial forgery in staging environments
    return false;
  }

  // Verify timestamp is within 5 minutes to prevent replay attacks
  const timestampNum = parseInt(timestamp, 10);
  if (!Number.isFinite(timestampNum)) {
    logger.security('Webhook timestamp is not a valid unix timestamp', {
      timestamp,
    });
    return false;
  }

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

    const normalizedSignature = signature.startsWith('sha256=')
      ? signature.slice('sha256='.length)
      : signature;

    try {
      if (
        /^[a-fA-F0-9]+$/.test(normalizedSignature) &&
        normalizedSignature.length === expectedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(normalizedSignature, 'hex'), Buffer.from(expectedSignature, 'hex'))
      ) {
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

/**
 * Manual ID Verification - Upload document images for verification
 */
export async function verifyIdDocument(
  frontImage: Buffer,
  backImage?: Buffer,
  vendorData?: string
): Promise<DiditClientResult<{
  request_id: string;
  id_verification: {
    status: 'Approved' | 'Declined';
    first_name?: string;
    last_name?: string;
    document_type?: string;
    document_number?: string;
    date_of_birth?: string;
    nationality?: string;
    expiration_date?: string;
    issuing_state?: string;
    warnings?: string[];
  };
}>> {
  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    form.append('front_image', frontImage, { filename: 'id_front.jpg' });
    if (backImage) {
      form.append('back_image', backImage, { filename: 'id_back.jpg' });
    }
    if (vendorData) {
      form.append('vendor_data', vendorData);
    }
    form.append('save_api_request', 'true');

    const response = await fetch(`${DIDIT_API_URL}/v3/id-verification/`, {
      method: 'POST',
      headers: {
        'x-api-key': DIDIT_API_KEY ?? '',
        ...form.getHeaders(),
      },
      body: form as any,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Didit ID verification failed', undefined, { status: response.status, data });
      return {
        success: false,
        error: data as DiditApiError,
      };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Failed to verify ID document', error as Error);
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
 * Passive Liveness Check - Verify user selfie is a real person
 */
export async function checkPassiveLiveness(
  userImage: Buffer,
  vendorData?: string
): Promise<DiditClientResult<{
  request_id: string;
  passive_liveness: {
    status: 'Approved' | 'Declined';
    score?: number;
    method?: string;
  };
}>> {
  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    form.append('user_image', userImage, { filename: 'selfie.jpg' });
    if (vendorData) {
      form.append('vendor_data', vendorData);
    }
    form.append('save_api_request', 'true');

    const response = await fetch(`${DIDIT_API_URL}/v3/passive-liveness/`, {
      method: 'POST',
      headers: {
        'x-api-key': DIDIT_API_KEY ?? '',
        ...form.getHeaders(),
      },
      body: form as any,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Didit liveness check failed', undefined, { status: response.status, data });
      return {
        success: false,
        error: data as DiditApiError,
      };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Failed to check liveness', error as Error);
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
 * Face Match - Compare selfie with ID photo
 */
export async function matchFaces(
  userImage: Buffer,
  refImage: Buffer,
  vendorData?: string
): Promise<DiditClientResult<{
  request_id: string;
  face_match: {
    status: 'Approved' | 'Declined';
    score?: number;
  };
}>> {
  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    form.append('user_image', userImage, { filename: 'selfie.jpg' });
    form.append('ref_image', refImage, { filename: 'id_photo.jpg' });
    if (vendorData) {
      form.append('vendor_data', vendorData);
    }
    form.append('save_api_request', 'true');

    const response = await fetch(`${DIDIT_API_URL}/v3/face-match/`, {
      method: 'POST',
      headers: {
        'x-api-key': DIDIT_API_KEY ?? '',
        ...form.getHeaders(),
      },
      body: form as any,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Didit face match failed', undefined, { status: response.status, data });
      return {
        success: false,
        error: data as DiditApiError,
      };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Failed to match faces', error as Error);
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
 * AML Screening - Check for sanctions, PEPs, adverse media
 */
export async function screenAml(params: {
  full_name: string;
  entity_type: 'person' | 'company';
  date_of_birth?: string;
  nationality?: string;
  document_number?: string;
  include_adverse_media?: boolean;
  include_ongoing_monitoring?: boolean;
  vendor_data?: string;
}): Promise<DiditClientResult<{
  request_id: string;
  aml: {
    status: 'Approved' | 'Declined';
    total_hits?: number;
    hits?: Array<{
      name: string;
      match_score: number;
      categories: string[];
      sources: string[];
    }>;
    score?: number;
    entity_type: string;
  };
}>> {
  try {
    const response = await fetch(`${DIDIT_API_URL}/v3/aml/`, {
      method: 'POST',
      headers: {
        'x-api-key': DIDIT_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        save_api_request: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Didit AML screening failed', undefined, { status: response.status, data });
      return {
        success: false,
        error: data as DiditApiError,
      };
    }

    return { success: true, data };
  } catch (error) {
    logger.error('Failed to screen AML', error as Error);
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

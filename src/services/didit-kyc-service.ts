/**
 * Didit KYC Service
 * Business logic for KYC verification using Didit API
 */

import { generateId } from '../utils/id.js';
import { userRepository } from '../repositories/user-repository.js';
import {
  createKycVerification,
  getKycVerificationById,
  getKycVerificationByUserId,
  getKycVerificationBySessionId,
  updateKycVerification,
  getKycVerificationsByStatus,
  getPendingReviews,
  getKycVerificationHistory,
} from '../repositories/didit-kyc-repository.js';
import {
  createVerificationSession,
  getVerificationDecision,
  getSessionDetails,
} from './didit-client.js';
import {
  KycVerification,
  CreateKycVerificationInput,
  DiditVerificationDecisionResponse,
  DiditWebhookPayload,
  KycStatus,
} from '../models/didit-kyc.js';

const DIDIT_WORKFLOW_ID = process.env['DIDIT_WORKFLOW_ID'];

if (!DIDIT_WORKFLOW_ID) {
  console.warn('DIDIT_WORKFLOW_ID not configured. Using default workflow.');
}

type ServiceResult<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

/**
 * Initiate KYC verification for a user
 */
export async function initiateKycVerification(
  input: CreateKycVerificationInput
): Promise<ServiceResult<KycVerification>> {
  // Check if user exists
  const user = await userRepository.getUserById(input.user_id);
  if (!user) {
    return {
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    };
  }

  // Check if user already has an active verification
  const existingKyc = await getKycVerificationByUserId(input.user_id);
  if (existingKyc && ['pending', 'in_progress'].includes(existingKyc.status)) {
    return {
      success: false,
      error: {
        code: 'VERIFICATION_IN_PROGRESS',
        message: 'User already has an active verification session',
      },
    };
  }

  if (existingKyc && existingKyc.status === 'approved') {
    return {
      success: false,
      error: {
        code: 'ALREADY_VERIFIED',
        message: 'User is already verified',
      },
    };
  }

  // Create Didit session
  const sessionResult = await createVerificationSession({
    workflow_id: DIDIT_WORKFLOW_ID ?? '',
    vendor_data: input.user_id,
    ...(input.metadata && { metadata: input.metadata }),
    ...(input.contact_details && { contact_details: input.contact_details }),
  });

  if (!sessionResult.success) {
    console.error('Didit session creation failed:', sessionResult.error);
    return {
      success: false,
      error: {
        code: sessionResult.error?.error?.code ?? 'DIDIT_API_ERROR',
        message: sessionResult.error?.error?.message ?? 'Failed to create Didit verification session',
      },
    };
  }

  const session = sessionResult.data;

  // Create KYC verification record
  const verification = await createKycVerification({
    id: generateId(),
    user_id: input.user_id,
    status: 'pending',
    didit_session_id: session.session_id,
    didit_session_token: session.session_token,
    didit_session_url: session.url,
    didit_workflow_id: session.workflow_id,
    ...(input.vendor_data && { vendor_data: input.vendor_data }),
    ...(input.metadata && { metadata: input.metadata as Record<string, unknown> }),
  });

  if (!verification) {
    return {
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to create verification record' },
    };
  }

  return { success: true, data: verification };
}

/**
 * Get KYC verification status for a user
 */
export async function getKycStatus(userId: string): Promise<ServiceResult<KycVerification | null>> {
  const verification = await getKycVerificationByUserId(userId);
  return { success: true, data: verification };
}

/**
 * Get KYC verification by ID
 */
export async function getKycById(id: string): Promise<ServiceResult<KycVerification | null>> {
  const verification = await getKycVerificationById(id);
  return { success: true, data: verification };
}

/**
 * Refresh verification status from Didit
 */
export async function refreshVerificationStatus(
  verificationId: string
): Promise<ServiceResult<KycVerification>> {
  const verification = await getKycVerificationById(verificationId);
  if (!verification) {
    return {
      success: false,
      error: { code: 'VERIFICATION_NOT_FOUND', message: 'Verification not found' },
    };
  }

  // Get latest status from Didit
  const sessionResult = await getSessionDetails(verification.didit_session_id);
  if (!sessionResult.success) {
    console.error('Failed to get session details:', sessionResult.error);
    return {
      success: false,
      error: {
        code: sessionResult.error?.error?.code ?? 'DIDIT_API_ERROR',
        message: sessionResult.error?.error?.message ?? 'Failed to fetch session details from Didit',
      },
    };
  }

  const session = sessionResult.data;
  const status = mapDiditStatusToKycStatus(session.status);

  // If completed, fetch decision
  if (session.status === 'Completed') {
    const decisionResult = await getVerificationDecision(verification.didit_session_id);
    if (decisionResult.success) {
      const updated = await processVerificationDecision(verification.id, decisionResult.data);
      if (updated) {
        return { success: true, data: updated };
      }
    }
  }

  // Update status
  const updated = await updateKycVerification(verification.id, { status });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update verification status' },
    };
  }

  return { success: true, data: updated };
}

/**
 * Process webhook from Didit
 */
export async function processWebhook(payload: DiditWebhookPayload): Promise<ServiceResult<KycVerification>> {
  const verification = await getKycVerificationBySessionId(payload.session_id);
  if (!verification) {
    return {
      success: false,
      error: { code: 'VERIFICATION_NOT_FOUND', message: 'Verification not found for session' },
    };
  }

  const status = mapDiditStatusToKycStatus(payload.status);

  // If completed, fetch full decision
  if (payload.status === 'Completed' && payload.decision) {
    const decisionResult = await getVerificationDecision(payload.session_id);
    if (decisionResult.success) {
      const updated = await processVerificationDecision(verification.id, decisionResult.data);
      if (updated) {
        return { success: true, data: updated };
      }
    }
  }

  // Update status
  const updated = await updateKycVerification(verification.id, { status });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update verification' },
    };
  }

  return { success: true, data: updated };
}

/**
 * Process verification decision and extract all data
 */
async function processVerificationDecision(
  verificationId: string,
  decision: DiditVerificationDecisionResponse
): Promise<KycVerification | null> {
  const updates: Partial<KycVerification> = {
    status: 'completed',
    decision: decision.decision,
    ...(decision.decline_reasons && { decline_reasons: decision.decline_reasons }),
    ...(decision.review_reasons && { review_reasons: decision.review_reasons }),
    completed_at: decision.completed_at ?? new Date().toISOString(),
  };

  // Extract ID verification data
  if (decision.id_verification) {
    const idv = decision.id_verification;
    if (idv.document_type) updates.document_type = idv.document_type;
    if (idv.document_number) updates.document_number = idv.document_number;
    if (idv.issuing_country) updates.issuing_country = idv.issuing_country;
    if (idv.first_name) updates.first_name = idv.first_name;
    if (idv.last_name) updates.last_name = idv.last_name;
    if (idv.date_of_birth) updates.date_of_birth = idv.date_of_birth;
    if (idv.nationality) updates.nationality = idv.nationality;
    updates.document_verified = idv.verification_status === 'verified';
  }

  // Extract liveness data
  if (decision.liveness_detection) {
    const liveness = decision.liveness_detection;
    updates.liveness_passed = liveness.liveness_status === 'passed';
    if (liveness.confidence_score !== undefined) {
      updates.liveness_confidence_score = liveness.confidence_score;
    }
    if (liveness.spoofing_detected !== undefined) {
      updates.spoofing_detected = liveness.spoofing_detected;
    }
  }

  // Extract face match data
  if (decision.face_match) {
    const faceMatch = decision.face_match;
    updates.face_matched = faceMatch.match_status === 'matched';
    if (faceMatch.similarity_score !== undefined) {
      updates.face_similarity_score = faceMatch.similarity_score;
    }
  }

  // Extract IP analysis data
  if (decision.ip_analysis) {
    const ipAnalysis = decision.ip_analysis;
    if (ipAnalysis.ip_address) updates.ip_address = ipAnalysis.ip_address;
    if (ipAnalysis.country_code) updates.ip_country_code = ipAnalysis.country_code;
    if (ipAnalysis.risk_score !== undefined) updates.ip_risk_score = ipAnalysis.risk_score;
    if (ipAnalysis.is_vpn !== undefined) updates.is_vpn = ipAnalysis.is_vpn;
    if (ipAnalysis.is_proxy !== undefined) updates.is_proxy = ipAnalysis.is_proxy;
    if (ipAnalysis.threat_level) updates.threat_level = ipAnalysis.threat_level;
  }

  // Set expiry date (1 year from completion for approved verifications)
  if (decision.decision === 'approved') {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    updates.expires_at = expiryDate.toISOString();
  }

  return updateKycVerification(verificationId, updates);
}

/**
 * Admin review and approve/reject verification
 */
export async function adminReviewVerification(
  verificationId: string,
  adminUserId: string,
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<ServiceResult<KycVerification>> {
  const verification = await getKycVerificationById(verificationId);
  if (!verification) {
    return {
      success: false,
      error: { code: 'VERIFICATION_NOT_FOUND', message: 'Verification not found' },
    };
  }

  if (verification.status !== 'completed') {
    return {
      success: false,
      error: {
        code: 'INVALID_STATUS',
        message: 'Can only review completed verifications',
      },
    };
  }

  const updates: Partial<KycVerification> = {
    status: decision,
    reviewed_by: adminUserId,
    reviewed_at: new Date().toISOString(),
    ...(notes && { admin_notes: notes }),
  };

  // Set expiry for approved verifications
  if (decision === 'approved' && !verification.expires_at) {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    updates.expires_at = expiryDate.toISOString();
  }

  const updated = await updateKycVerification(verificationId, updates);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update verification' },
    };
  }

  return { success: true, data: updated };
}

/**
 * Get all verifications pending admin review
 */
export async function getPendingAdminReviews(): Promise<ServiceResult<KycVerification[]>> {
  const verifications = await getPendingReviews();
  return { success: true, data: verifications };
}

/**
 * Get verifications by status
 */
export async function getVerificationsByStatus(
  status: KycStatus
): Promise<ServiceResult<KycVerification[]>> {
  const verifications = await getKycVerificationsByStatus(status);
  return { success: true, data: verifications };
}

/**
 * Get user's verification history
 */
export async function getUserVerificationHistory(
  userId: string
): Promise<ServiceResult<KycVerification[]>> {
  const verifications = await getKycVerificationHistory(userId);
  return { success: true, data: verifications };
}

/**
 * Check if user is verified
 */
export async function isUserVerified(userId: string): Promise<boolean> {
  const verification = await getKycVerificationByUserId(userId);
  if (!verification) return false;
  
  if (verification.status !== 'approved') return false;
  
  // Check expiry
  if (verification.expires_at) {
    const expiryDate = new Date(verification.expires_at);
    if (expiryDate < new Date()) return false;
  }
  
  return true;
}

/**
 * Map Didit session status to our KYC status
 */
function mapDiditStatusToKycStatus(diditStatus: string): KycStatus {
  switch (diditStatus) {
    case 'Not Started':
      return 'pending';
    case 'In Progress':
      return 'in_progress';
    case 'Completed':
      return 'completed';
    case 'Expired':
      return 'expired';
    case 'Cancelled':
      return 'rejected';
    default:
      return 'pending';
  }
}

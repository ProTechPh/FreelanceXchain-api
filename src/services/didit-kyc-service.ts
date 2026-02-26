/**
 * Didit KYC Service
 * Business logic for KYC verification using Didit API
 * 
 * Note: Didit handles all verification data (documents, liveness, face match, IP analysis).
 * We only store session info and final decision locally.
 */

import { generateId } from '../utils/id.js';
import { userRepository } from '../repositories/user-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { employerProfileRepository } from '../repositories/employer-profile-repository.js';
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
  getVerificationSession,
} from './didit-client.js';
import {
  KycVerification,
  CreateKycVerificationInput,
  DiditWebhookPayload,
  KycStatus,
} from '../models/didit-kyc.js';
import { logger } from '../config/logger.js';

const DIDIT_WORKFLOW_ID = process.env['DIDIT_WORKFLOW_ID'];

if (!DIDIT_WORKFLOW_ID) {
  logger.warn('DIDIT_WORKFLOW_ID not configured. Using default workflow.');
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
  const sessionResult = await getVerificationSession(verification.didit_session_id);
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

  // Update status if completed
  const updates: Partial<KycVerification> = { status };
  
  if (session.status === 'Completed') {
    updates.completed_at = new Date().toISOString();
  }

  const updated = await updateKycVerification(verification.id, updates);
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
  const updates: Partial<KycVerification> = { status };

  // Variables to store KYC data for profile creation
  let firstName: string | null = null;
  let lastName: string | null = null;
  let nationality: string | null = null;

  // Handle final statuses with decision data
  if (['Approved', 'Declined', 'In Review'].includes(payload.status)) {
    updates.completed_at = new Date(payload.timestamp * 1000).toISOString();
    
    // Map Didit status to our decision field
    if (payload.status === 'Approved') {
      updates.decision = 'approved';
      // Set expiry date (1 year from completion)
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      updates.expires_at = expiryDate.toISOString();
    } else if (payload.status === 'Declined') {
      updates.decision = 'declined';
    } else if (payload.status === 'In Review') {
      updates.decision = 'review';
    }

    // Extract basic info from decision data
    if (payload.decision) {
      const idVerification = payload.decision.id_verifications?.[0];
      if (idVerification) {
        firstName = idVerification.first_name ?? null;
        lastName = idVerification.last_name ?? null;
        nationality = idVerification.nationality ?? idVerification.issuing_state_name ?? null;
        
        updates.first_name = firstName;
        updates.last_name = lastName;
        updates.date_of_birth = idVerification.date_of_birth ?? null;
        updates.nationality = nationality;
        updates.document_type = idVerification.document_type ?? null;
        updates.document_number = idVerification.document_number ?? null;
        updates.issuing_country = idVerification.issuing_state_name ?? null;
        updates.document_verified = idVerification.status === 'Approved';
      }

      // Extract liveness data
      const livenessCheck = payload.decision.liveness_checks?.[0];
      if (livenessCheck) {
        updates.liveness_passed = livenessCheck.status === 'Approved';
        updates.liveness_confidence_score = livenessCheck.score?.toString() ?? null;
      }

      // Extract face match data
      const faceMatch = payload.decision.face_matches?.[0];
      if (faceMatch) {
        updates.face_matched = faceMatch.status === 'Approved';
        updates.face_similarity_score = faceMatch.score?.toString() ?? null;
      }

      // Extract IP analysis data
      const ipAnalysis = payload.decision.ip_analyses?.[0];
      if (ipAnalysis) {
        updates.ip_address = ipAnalysis.ip_address ?? null;
        updates.ip_country_code = ipAnalysis.ip_country_code ?? null;
        updates.is_vpn = ipAnalysis.is_vpn_or_tor ?? null;
        updates.is_proxy = ipAnalysis.is_data_center ?? null;
      }
    }
  }

  const updated = await updateKycVerification(verification.id, updates);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update verification' },
    };
  }

  // Auto-create profile when KYC is approved
  if (payload.status === 'Approved') {
    await autoCreateProfile(verification.user_id, firstName, lastName, nationality);
  }

  return { success: true, data: updated };
}

/**
 * Auto-create profile based on user role when KYC is approved
 * Also syncs KYC name to users table and existing profiles
 */
async function autoCreateProfile(
  userId: string,
  firstName: string | null,
  lastName: string | null,
  nationality: string | null
): Promise<void> {
  await syncKycNameToUserAndProfiles(userId, firstName, lastName, nationality);
}

/**
 * Sync KYC name to users table and profiles
 * Shared logic for webhook and admin approval flows
 */
async function syncKycNameToUserAndProfiles(
  userId: string,
  firstName: string | null,
  lastName: string | null,
  nationality: string | null
): Promise<void> {
  try {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      console.error(`Sync KYC name: User not found: ${userId}`);
      return;
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ') || user.name || 'User';

    // Sync name to users table (KYC is source of truth)
    if (fullName && fullName !== 'User') {
      await userRepository.updateUserName(userId, fullName);
      console.log(`Synced KYC name to users table for user: ${userId}`);
    }

    if (user.role === 'freelancer') {
      // Check if profile already exists
      const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
      if (existingProfile) {
        console.log(`Freelancer profile already exists for user: ${userId}`);
        // Update existing profile with KYC name
        await freelancerProfileRepository.updateProfile(existingProfile.id, {
          name: fullName,
          nationality: nationality,
        });
        console.log(`Updated freelancer profile name from KYC for user: ${userId}`);
        return;
      }

      // Create freelancer profile
      const bio = `Hi, I'm ${fullName}. I'm a verified freelancer ready to work on your projects.`;
      
      await freelancerProfileRepository.createProfile({
        id: generateId(),
        user_id: userId,
        name: fullName,
        nationality: nationality,
        bio,
        hourly_rate: 0,
        skills: [],
        experience: [],
        availability: 'available',
      });
      
      console.log(`Auto-created freelancer profile for user: ${userId}`);
      
    } else if (user.role === 'employer') {
      // Check if profile already exists
      const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
      if (existingProfile) {
        console.log(`Employer profile already exists for user: ${userId}`);
        // Update existing profile with KYC name
        await employerProfileRepository.updateProfile(existingProfile.id, {
          name: fullName,
          nationality: nationality,
        });
        console.log(`Updated employer profile name from KYC for user: ${userId}`);
        return;
      }

      // Create employer profile
      const description = `Verified employer: ${fullName}. Looking for talented freelancers.`;
      
      await employerProfileRepository.createProfile({
        id: generateId(),
        user_id: userId,
        name: fullName,
        nationality: nationality,
        company_name: fullName,
        description,
        industry: 'Technology',
      });
      
      console.log(`Auto-created employer profile for user: ${userId}`);
    }
  } catch (error) {
    console.error(`Failed to sync KYC name for user ${userId}:`, error);
    // Don't throw - profile sync failure shouldn't fail the webhook/approval
  }
}

/**
 * Get KYC data formatted for profile creation
 * Returns basic info that can be used to pre-populate profile
 */
export async function getProfileDataFromKyc(userId: string): Promise<ServiceResult<ProfileDataFromKyc | null>> {
  const verification = await getKycVerificationByUserId(userId);
  
  if (!verification) {
    return {
      success: false,
      error: { code: 'NO_KYC', message: 'No KYC verification found for user' },
    };
  }

  if (verification.status !== 'approved') {
    return {
      success: false,
      error: { code: 'KYC_NOT_APPROVED', message: 'KYC verification is not approved' },
    };
  }

  const profileData: ProfileDataFromKyc = {
    name: [verification.first_name, verification.last_name].filter(Boolean).join(' ') || null,
    first_name: verification.first_name ?? null,
    last_name: verification.last_name ?? null,
    nationality: verification.nationality ?? null,
    kyc_verified: true,
    kyc_verified_at: verification.completed_at ?? null,
  };

  return { success: true, data: profileData };
}

type ProfileDataFromKyc = {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  nationality: string | null;
  kyc_verified: boolean;
  kyc_verified_at: string | null;
};

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

  // Sync name to users table and profiles when admin approves
  if (decision === 'approved') {
    await syncKycNameToUserAndProfiles(
      verification.user_id,
      verification.first_name ?? null,
      verification.last_name ?? null,
      verification.nationality ?? null
    );
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
 * FIXED: Handle 'Completed' and 'Cancelled' statuses that were falling through to default
 * The Didit session API returns different values than the webhook:
 *   Session API: 'Not Started', 'In Progress', 'Completed', 'Expired', 'Cancelled'
 *   Webhook:     'Approved', 'Declined', 'In Review'
 */
function mapDiditStatusToKycStatus(diditStatus: string): KycStatus {
  switch (diditStatus) {
    case 'Not Started':
      return 'pending';
    case 'In Progress':
      return 'in_progress';
    case 'Completed':
      return 'completed';  // FIXED: Was falling through to default ('pending')
    case 'Approved':
      return 'approved';
    case 'Declined':
      return 'rejected';
    case 'In Review':
      return 'completed'; // Needs admin review
    case 'Expired':
      return 'expired';
    case 'Abandoned':
      return 'expired';
    case 'Cancelled':
      return 'expired';   // FIXED: Was falling through to default ('pending')
    default:
      // Log unexpected statuses instead of silently defaulting
      console.warn(`[KYC] Unknown Didit status: "${diditStatus}", defaulting to "pending"`);
      return 'pending';
  }
}

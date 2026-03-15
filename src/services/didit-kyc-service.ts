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
  verifyIdDocument,
  checkPassiveLiveness,
  matchFaces,
  screenAml,
} from './didit-client.js';
import {
  KycVerification,
  CreateKycVerificationInput,
  DiditWebhookPayload,
  KycStatus,
} from '../models/didit-kyc.js';
import { logger } from '../config/logger.js';

const DIDIT_WORKFLOW_ID = process.env['DIDIT_WORKFLOW_ID'];

// Retry cooldown period in hours (24 hours = 1 day)
const KYC_RETRY_COOLDOWN_HOURS = 24;

if (!DIDIT_WORKFLOW_ID) {
  logger.warn('DIDIT_WORKFLOW_ID not configured. Using default workflow.');
}

type ServiceResult<T> = { success: true; data: T } | { success: false; error: { code: string; message: string; retryAfter?: string } };

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

  // Check if user already has a verification
  const existingKyc = await getKycVerificationByUserId(input.user_id);

  // If already approved, don't allow retry
  if (existingKyc && existingKyc.status === 'approved') {
    return {
      success: false,
      error: {
        code: 'ALREADY_VERIFIED',
        message: 'User is already verified',
      },
    };
  }

  // Check cooldown for pending/in_progress/rejected/expired verifications
  if (existingKyc && ['pending', 'in_progress', 'rejected', 'expired'].includes(existingKyc.status)) {
    const createdAt = new Date(existingKyc.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation < KYC_RETRY_COOLDOWN_HOURS) {
      const hoursRemaining = Math.ceil(KYC_RETRY_COOLDOWN_HOURS - hoursSinceCreation);
      const retryAfter = new Date(createdAt.getTime() + KYC_RETRY_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

      return {
        success: false,
        error: {
          code: 'RETRY_COOLDOWN',
          message: `Please wait ${hoursRemaining} hour(s) before retrying KYC verification`,
          retryAfter,
        },
      };
    }

    // Cooldown passed, allow retry by creating new session
    logger.info('KYC retry allowed after cooldown', {
      userId: input.user_id,
      previousStatus: existingKyc.status,
      hoursSinceCreation,
    });
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

  let verification: KycVerification | null;

  // Update existing record or create new one
  if (existingKyc) {
    verification = await updateKycVerification(existingKyc.id, {
      status: 'pending',
      didit_session_id: session.session_id,
      didit_session_token: session.session_token,
      didit_session_url: session.url,
      didit_workflow_id: session.workflow_id,
      updated_at: new Date().toISOString(),
    });
  } else {
    // Create new KYC verification record
    verification = await createKycVerification({
      id: generateId(),
      user_id: input.user_id,
      status: 'pending',
      didit_session_id: session.session_id,
      didit_session_token: session.session_token,
      didit_session_url: session.url,
      didit_workflow_id: session.workflow_id,
    });
  }

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

/**
 * Manual KYC Verification - Admin uploads documents for a user
 */
export async function manualKycVerification(params: {
  userId: string;
  adminUserId: string;
  idFrontImage: Buffer;
  idBackImage?: Buffer;
  selfieImage: Buffer;
}): Promise<ServiceResult<KycVerification>> {
  const { userId, adminUserId, idFrontImage, idBackImage, selfieImage } = params;

  // Check if user exists
  const user = await userRepository.getUserById(userId);
  if (!user) {
    return {
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    };
  }

  // Check if user already has an active verification
  const existingVerification = await getKycVerificationByUserId(userId);
  if (existingVerification && existingVerification.status === 'approved') {
    return {
      success: false,
      error: { code: 'ALREADY_VERIFIED', message: 'User is already verified' },
    };
  }

  try {
    // Step 1: Verify ID document
    logger.info('Manual KYC: Verifying ID document', { userId });
    const idResult = await verifyIdDocument(idFrontImage, idBackImage, userId);

    if (!idResult.success) {
      return {
        success: false,
        error: { code: 'ID_VERIFICATION_FAILED', message: 'ID verification failed' },
      };
    }

    const idData = idResult.data.id_verification;
    if (idData.status !== 'Approved') {
      return {
        success: false,
        error: { code: 'ID_DECLINED', message: 'ID document was declined by Didit' },
      };
    }

    // Step 2: Check liveness
    logger.info('Manual KYC: Checking liveness', { userId });
    const livenessResult = await checkPassiveLiveness(selfieImage, userId);

    if (!livenessResult.success) {
      return {
        success: false,
        error: { code: 'LIVENESS_CHECK_FAILED', message: 'Liveness check failed' },
      };
    }

    const livenessData = livenessResult.data.passive_liveness;
    if (livenessData.status !== 'Approved') {
      return {
        success: false,
        error: { code: 'LIVENESS_DECLINED', message: 'Liveness check declined - possible spoof detected' },
      };
    }

    // Step 3: Face match (compare selfie with ID photo)
    logger.info('Manual KYC: Matching faces', { userId });
    const faceMatchResult = await matchFaces(selfieImage, idFrontImage, userId);

    if (!faceMatchResult.success) {
      return {
        success: false,
        error: { code: 'FACE_MATCH_FAILED', message: 'Face match failed' },
      };
    }

    const faceMatchData = faceMatchResult.data.face_match;
    if (faceMatchData.status !== 'Approved') {
      return {
        success: false,
        error: { code: 'FACE_MISMATCH', message: 'Face does not match ID photo' },
      };
    }

    // Step 4: Optional AML screening
    let amlClean = true;
    if (idData.first_name && idData.last_name) {
      logger.info('Manual KYC: Running AML screening', { userId });
      const amlParams: {
        full_name: string;
        entity_type: 'person' | 'company';
        date_of_birth?: string;
        nationality?: string;
        document_number?: string;
        vendor_data?: string;
      } = {
        full_name: `${idData.first_name} ${idData.last_name}`,
        entity_type: 'person',
        vendor_data: userId,
      };

      if (idData.date_of_birth) amlParams.date_of_birth = idData.date_of_birth;
      if (idData.nationality) amlParams.nationality = idData.nationality;
      if (idData.document_number) amlParams.document_number = idData.document_number;

      const amlResult = await screenAml(amlParams);

      if (amlResult.success && amlResult.data.aml.status === 'Declined') {
        amlClean = false;
        logger.warn('Manual KYC: AML screening found hits', {
          userId,
          hits: amlResult.data.aml.total_hits
        });
      }
    }

    // Create or update KYC verification record
    const verificationData: Partial<KycVerification> = {
      user_id: userId,
      status: amlClean ? 'approved' : 'completed', // Auto-approve if AML clean, otherwise needs review
      didit_session_id: `manual-${generateId()}`,
      didit_session_token: null,
      didit_session_url: null,
      didit_workflow_id: 'manual-verification',
      decision: amlClean ? 'approved' : 'review',
      document_type: idData.document_type || null,
      document_number: idData.document_number || null,
      issuing_country: idData.issuing_state || null,
      first_name: idData.first_name || null,
      last_name: idData.last_name || null,
      date_of_birth: idData.date_of_birth || null,
      nationality: idData.nationality || null,
      document_verified: true,
      liveness_passed: true,
      liveness_confidence_score: livenessData.score?.toString() || '100',
      face_matched: true,
      face_similarity_score: faceMatchData.score?.toString() || '100',
      reviewed_by: amlClean ? adminUserId : null,
      reviewed_at: amlClean ? new Date().toISOString() : null,
      admin_notes: amlClean ? 'Manual verification - all checks passed' : 'Manual verification - AML review required',
      completed_at: new Date().toISOString(),
      expires_at: amlClean ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null, // 1 year
    };

    let verification: KycVerification | null;

    if (existingVerification) {
      verification = await updateKycVerification(existingVerification.id, verificationData);
    } else {
      verification = await createKycVerification({
        ...verificationData,
        id: generateId(),
      } as Omit<KycVerification, 'created_at' | 'updated_at'>);
    }

    if (!verification) {
      return {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to save verification' },
      };
    }

    // Sync name to user and profiles if approved
    if (amlClean) {
      await syncKycNameToUserAndProfiles(
        userId,
        idData.first_name || null,
        idData.last_name || null,
        idData.nationality || null
      );
    }

    logger.info('Manual KYC verification completed', {
      userId,
      verificationId: verification.id,
      status: verification.status,
      amlClean
    });

    return { success: true, data: verification };
  } catch (error) {
    logger.error('Manual KYC verification error', error as Error, { userId });
    return {
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error instanceof Error ? error.message : 'Manual verification failed'
      },
    };
  }
}


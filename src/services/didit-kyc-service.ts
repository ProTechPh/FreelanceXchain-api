/**
 * Note: Didit handles all verification data (documents, liveness, face match, IP analysis).
 * We only store session info and final decision locally.
 */

import { generateId } from '../utils/id.js';
import { userRepository } from '../repositories/user-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { employerProfileRepository } from '../repositories/employer-profile-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
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
  getVerificationDecision,
  verifyIdDocument,
  checkPassiveLiveness,
  matchFaces,
  screenAml,
} from './didit-client.js';
import {
  KycVerification,
  CreateKycVerificationInput,
  DiditWebhookPayload,
  DiditVerificationDecisionResponse,
  KycStatus,
} from '../models/didit-kyc.js';
import { logger } from '../config/logger.js';
import { withLock } from '../utils/async-lock.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { sendGatedEmail, sendKycApprovedEmail, sendKycRejectedEmail } from './email-delivery-service.js';

const DIDIT_WORKFLOW_ID = process.env['DIDIT_WORKFLOW_ID'];

// Retry cooldown period in hours (24 hours = 1 day)
const KYC_RETRY_COOLDOWN_HOURS = 24;

if (!DIDIT_WORKFLOW_ID) {
  logger.warn('DIDIT_WORKFLOW_ID not configured. Using default workflow.');
}

export async function initiateKycVerification(
  input: CreateKycVerificationInput
): Promise<ServiceResult<KycVerification>> {
  const user = await userRepository.getUserById(input.user_id);
  if (!user) {
    return errorResult('USER_NOT_FOUND', 'User not found');
  }

  const existingKyc = await getKycVerificationByUserId(input.user_id);

  if (existingKyc && existingKyc.status === 'approved') {
    return errorResult('ALREADY_VERIFIED', 'User is already verified');
  }

  if (existingKyc && ['pending', 'in_progress', 'rejected', 'expired'].includes(existingKyc.status)) {
    const createdAt = new Date(existingKyc.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation < KYC_RETRY_COOLDOWN_HOURS) {
      const hoursRemaining = Math.ceil(KYC_RETRY_COOLDOWN_HOURS - hoursSinceCreation);
      const retryAfter = new Date(createdAt.getTime() + KYC_RETRY_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

      return {
        success: false,
        error: { code: 'RETRY_COOLDOWN', message: `Please wait ${hoursRemaining} hour(s) before retrying KYC verification`, retryAfter },
      };
    }

    logger.info('KYC retry allowed after cooldown', {
      userId: input.user_id,
      previousStatus: existingKyc.status,
      hoursSinceCreation,
    });
  }

  const sessionResult = await createVerificationSession({
    workflow_id: DIDIT_WORKFLOW_ID ?? '',
    vendor_data: input.user_id,
  });

  if (!sessionResult.success) {
    logger.error('Didit session creation failed', { error: sessionResult.error });
    return errorResult(sessionResult.error?.error?.code ?? 'DIDIT_API_ERROR', sessionResult.error?.error?.message ?? 'Failed to create Didit verification session');
  }

  const session = sessionResult.data;

  let verification: KycVerification | null;

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
    return errorResult('DATABASE_ERROR', 'Failed to create verification record');
  }

  return successResult(verification);
}

export async function getKycStatus(userId: string): Promise<ServiceResult<KycVerification | null>> {
  try {
    const verification = await getKycVerificationByUserId(userId);
    return successResult(verification);
  } catch (error) {
    logger.error('Failed to load KYC verification status', error as Error, { userId });
    return errorResult('DATABASE_ERROR', 'Unable to load KYC verification status');
  }
}

export async function getKycById(id: string): Promise<ServiceResult<KycVerification | null>> {
  const verification = await getKycVerificationById(id);
  return successResult(verification);
}

function parseBarcodeSubject(idVerification: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!idVerification) return null;
  const rawBarcodes = idVerification['barcodes'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(rawBarcodes) && rawBarcodes.length > 0) {
    try {
      const rawData = rawBarcodes[0]?.['data'];
      if (typeof rawData === 'string' && rawData.startsWith('{')) {
        const parsed = JSON.parse(rawData);
        if (parsed && typeof parsed.subject === 'object') {
          return parsed.subject as Record<string, unknown>;
        }
      }
    } catch {
      // ignore barcode parsing error
    }
  }
  return null;
}

type ExtractedDecisionData = {
  updates: Partial<KycVerification>;
  images: {
    front_image?: string | null;
    back_image?: string | null;
    portrait_image?: string | null;
    reference_image?: string | null;
    full_front_image?: string | null;
    full_back_image?: string | null;
  };
  warnings: Array<{ feature?: string; risk?: string; short_description?: string; long_description?: string }>;
  extractedIdentity: { firstName: string | null; lastName: string | null; nationality: string | null };
};

function extractDecisionData(
  decision: DiditVerificationDecisionResponse,
  baseImages: Record<string, string | null | undefined> = {},
  existingMetadata: Record<string, unknown> | null = null
): ExtractedDecisionData {
  const idVerification = decision.id_verifications?.[0];
  const livenessCheck = decision.liveness_checks?.[0];
  const faceMatch = decision.face_matches?.[0];
  const ipAnalysis = decision.ip_analyses?.[0];

  const barcodeSubject = parseBarcodeSubject(idVerification as Record<string, unknown> | undefined);
  const images = {
    front_image: idVerification?.front_image || idVerification?.full_front_image || baseImages['front_image'] || null,
    back_image: idVerification?.back_image || idVerification?.full_back_image || baseImages['back_image'] || null,
    portrait_image: idVerification?.portrait_image || baseImages['portrait_image'] || null,
    reference_image: livenessCheck?.reference_image || faceMatch?.target_image || baseImages['reference_image'] || null,
    full_front_image: idVerification?.full_front_image || baseImages['full_front_image'] || null,
    full_back_image: idVerification?.full_back_image || baseImages['full_back_image'] || null,
  };

  const warnings: Array<{ feature?: string; risk?: string; short_description?: string; long_description?: string }> = [
    ...(idVerification?.warnings || []),
    ...(livenessCheck?.warnings || []),
    ...(faceMatch?.warnings || []),
  ];

  const updates: Partial<KycVerification> = {};

  if (idVerification) {
    updates.first_name = idVerification.first_name ?? null;
    updates.last_name = idVerification.last_name ?? null;
    const birthDate = idVerification.date_of_birth || (barcodeSubject?.['DOB'] as string) || null;
    if (birthDate) updates.date_of_birth = birthDate;
    updates.nationality = idVerification.nationality || idVerification.issuing_state_name || idVerification.issuing_state || 'Philippines';
    updates.document_type = idVerification.document_type || (barcodeSubject ? 'PhilID (National ID)' : 'Identity Card');
    const docNum = idVerification.document_number || (barcodeSubject?.['PCN'] as string);
    if (docNum) updates.document_number = docNum;
    updates.issuing_country = idVerification.issuing_state_name || idVerification.issuing_state || idVerification.nationality || 'Philippines';
    updates.document_verified = idVerification.status === 'Approved';
  }

  if (livenessCheck) {
    updates.liveness_passed = livenessCheck.status === 'Approved';
    if (livenessCheck.score !== undefined && livenessCheck.score !== null) {
      updates.liveness_confidence_score = livenessCheck.score.toString();
    }
  }

  if (faceMatch) {
    updates.face_matched = faceMatch.status === 'Approved';
    if (faceMatch.score !== undefined && faceMatch.score !== null) {
      updates.face_similarity_score = faceMatch.score.toString();
    }
  }

  if (ipAnalysis) {
    if (ipAnalysis.ip_address) updates.ip_address = ipAnalysis.ip_address;
    const ipCtry = ipAnalysis.ip_country || ipAnalysis.ip_country_code;
    if (ipCtry) updates.ip_country_code = ipCtry;
    updates.is_vpn = ipAnalysis.is_vpn_or_tor ?? false;
    updates.is_proxy = ipAnalysis.is_data_center ?? false;
  }

  updates.metadata = {
    ...(typeof existingMetadata === 'object' && existingMetadata !== null ? existingMetadata : {}),
    images,
    warnings,
  };

  return {
    updates,
    images,
    warnings,
    extractedIdentity: {
      firstName: updates.first_name ?? null,
      lastName: updates.last_name ?? null,
      nationality: updates.nationality ?? null,
    },
  };
}

export async function refreshVerificationStatus(
  verificationId: string
): Promise<ServiceResult<KycVerification>> {
  const verification = await getKycVerificationById(verificationId);
  if (!verification) {
    return errorResult('VERIFICATION_NOT_FOUND', 'Verification not found');
  }

  const sessionResult = await getVerificationSession(verification.didit_session_id);
  if (!sessionResult.success) {
    logger.error('Failed to get session details', { error: sessionResult.error });
    return errorResult(sessionResult.error?.error?.code ?? 'DIDIT_API_ERROR', sessionResult.error?.error?.message ?? 'Failed to fetch session details from Didit');
  }

  const session = sessionResult.data;
  const updates: Partial<KycVerification> = { status: mapDiditStatusToKycStatus(session.status) };
  
  if (['Completed', 'Approved', 'Declined', 'In Review'].includes(session.status)) {
    updates.completed_at = new Date().toISOString();
    if (session.status === 'Approved') {
      updates.decision = 'approved';
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      updates.expires_at = expiryDate.toISOString();
    } else if (session.status === 'Declined') {
      updates.decision = 'declined';
    } else if (session.status === 'In Review') {
      updates.decision = 'review';
    }
  }

  const sessionData = session as unknown as DiditVerificationDecisionResponse;
  const extracted = extractDecisionData(
    sessionData,
    {},
    verification.metadata as Record<string, unknown> | null
  );
  Object.assign(updates, extracted.updates);

  const updated = await updateKycVerification(verification.id, updates);
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to update verification status');
  }

  if (session.status === 'Approved') {
    const { firstName, lastName, nationality } = extracted.extractedIdentity;
    await autoCreateProfile(verification.user_id, firstName, lastName, nationality);
  }

  return successResult(updated);
}

export async function getAdminVerificationDecision(verificationId: string): Promise<ServiceResult<{
  verification: KycVerification;
  decision: DiditVerificationDecisionResponse | null;
  images: {
    front_image?: string | null;
    back_image?: string | null;
    portrait_image?: string | null;
    reference_image?: string | null;
    full_front_image?: string | null;
    full_back_image?: string | null;
  };
  warnings: Array<{ feature?: string; risk?: string; short_description?: string; long_description?: string }>;
}>> {
  let verification = await getKycVerificationById(verificationId);
  if (!verification) {
    return errorResult('VERIFICATION_NOT_FOUND', 'Verification not found');
  }

  let decision: DiditVerificationDecisionResponse | null = null;
  const metadata = verification.metadata as Record<string, unknown> | null;
  let images = (metadata?.images as Record<string, string | null | undefined>) || {};
  let warnings = (metadata?.warnings as Array<{ feature?: string; risk?: string; short_description?: string; long_description?: string }>) || [];

  if (verification.didit_session_id) {
    const decisionResult = await getVerificationDecision(verification.didit_session_id);
    if (decisionResult.success && decisionResult.data) {
      decision = decisionResult.data;
      const extracted = extractDecisionData(decision, images, metadata);
      images = extracted.images;
      warnings = extracted.warnings;

      try {
        const updatedRecord = await updateKycVerification(verification.id, extracted.updates);
        if (updatedRecord) {
          verification = updatedRecord;
        } else {
          Object.assign(verification, extracted.updates);
        }
      } catch (err) {
        logger.warn('Failed to update KYC verification with decision details', { error: err });
        Object.assign(verification, extracted.updates);
      }
    }
  }

  return successResult({
    verification,
    decision,
    images,
    warnings,
  });
}

// L4: Track processed webhook event IDs to prevent duplicate processing
const processedWebhookEvents = new Map<string, number>();
const WEBHOOK_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanupProcessedEvents(): void {
  const now = Date.now();
  for (const [eventId, timestamp] of processedWebhookEvents) {
    if (now - timestamp > WEBHOOK_EVENT_TTL_MS) {
      processedWebhookEvents.delete(eventId);
    }
  }
}

type WebhookProfileData = {
  firstName: string | null;
  lastName: string | null;
  nationality: string | null;
};

/**
 * Deduplicate webhook events — Didit uses at-least-once delivery.
 * Returns an already-processed result when the event was seen before,
 * or null when processing should continue.
 *
 * NOTE: processedWebhookEvents is per-process (single-instance safe). Multi-instance
 * deployments should back this with a shared store (e.g. Redis). The status updates
 * and autoCreateProfile below are themselves idempotent (overwrite / existence-check),
 * so cross-instance re-delivery cannot corrupt KYC state, only re-emit notifications.
 */
async function handleDuplicateWebhookEvent(payload: DiditWebhookPayload): Promise<ServiceResult<KycVerification> | null> {
  if (!payload.event_id) return null;

  if (!processedWebhookEvents.has(payload.event_id)) {
    processedWebhookEvents.set(payload.event_id, Date.now());
    if (processedWebhookEvents.size > 1000) {
      cleanupProcessedEvents();
    }
    return null;
  }

  logger.info('Duplicate webhook event ignored', { eventId: payload.event_id, sessionId: payload.session_id });
  // Return success since the event was already processed
  const existingVerification = await getKycVerificationBySessionId(payload.session_id);
  return existingVerification ? successResult(existingVerification) : null;
}

/**
 * Map a Didit webhook payload to the verification updates it implies,
 * also extracting the profile data needed when KYC is approved.
 */
function buildWebhookUpdates(payload: DiditWebhookPayload): { updates: Partial<KycVerification> } & WebhookProfileData {
  const status = mapDiditStatusToKycStatus(payload.status);

  const updates: Partial<KycVerification> = { status };

  let firstName: string | null = null;
  let lastName: string | null = null;
  let nationality: string | null = null;

  if (['Approved', 'Declined', 'In Review'].includes(payload.status)) {
    updates.completed_at = payload.timestamp ? new Date(payload.timestamp * 1000).toISOString() : new Date().toISOString();

    if (payload.status === 'Approved') {
      updates.decision = 'approved';
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      updates.expires_at = expiryDate.toISOString();
    } else if (payload.status === 'Declined') {
      updates.decision = 'declined';
    } else if (payload.status === 'In Review') {
      updates.decision = 'review';
    }

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

      const livenessCheck = payload.decision.liveness_checks?.[0];
      if (livenessCheck) {
        updates.liveness_passed = livenessCheck.status === 'Approved';
        updates.liveness_confidence_score = livenessCheck.score?.toString() ?? null;
      }

      const faceMatch = payload.decision.face_matches?.[0];
      if (faceMatch) {
        updates.face_matched = faceMatch.status === 'Approved';
        updates.face_similarity_score = faceMatch.score?.toString() ?? null;
      }

      const ipAnalysis = payload.decision.ip_analyses?.[0];
      if (ipAnalysis) {
        updates.ip_address = ipAnalysis.ip_address ?? null;
        updates.ip_country_code = ipAnalysis.ip_country_code ?? null;
        updates.is_vpn = ipAnalysis.is_vpn_or_tor ?? null;
        updates.is_proxy = ipAnalysis.is_data_center ?? null;
      }
    }
  }

  return { updates, firstName, lastName, nationality };
}

export async function processWebhook(payload: DiditWebhookPayload): Promise<ServiceResult<KycVerification>> {
  // L4: Deduplicate webhook events — Didit uses at-least-once delivery. The event
  // map is a per-process fast path; the per-session lock below makes the
  // read-modify-write of status atomic within an instance, and the final-state
  // guard makes cross-instance re-delivery safe (no regression out of a final
  // state, so a stale duplicate cannot flip approved back to pending).
  return withLock(`kyc-webhook:${payload.session_id}`, async () => {
  const duplicateResult = await handleDuplicateWebhookEvent(payload);
  if (duplicateResult) return duplicateResult;

  const verification = await getKycVerificationBySessionId(payload.session_id);
  if (!verification) {
    return errorResult('VERIFICATION_NOT_FOUND', 'Verification not found for session');
  }

  // L4.1: Never regress a final KYC state (approved/rejected/expired) via a stale
  // or out-of-order webhook delivery — that would corrupt verification integrity.
  const FINAL_KYC_STATES: KycStatus[] = ['approved', 'rejected', 'expired'];
  if (FINAL_KYC_STATES.includes(verification.status)) {
    const status = mapDiditStatusToKycStatus(payload.status);
    if (verification.status === status) {
      // Same final state re-delivered — idempotent no-op.
      return successResult(verification);
    }
    logger.warn('KYC webhook ignored: refusing to regress final state', {
      sessionId: payload.session_id,
      currentStatus: verification.status,
      incomingStatus: status,
    });
    return successResult(verification);
  }

  const { updates, firstName, lastName, nationality } = buildWebhookUpdates(payload);

  const updated = await updateKycVerification(verification.id, updates);
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to update verification');
  }

  if (payload.status === 'Approved') {
    await autoCreateProfile(verification.user_id, firstName, lastName, nationality);
  }

  // Transactional emails gated by the user's email preferences. Best-effort:
  // a preference lookup or send failure must never break webhook processing.
  if (payload.status === 'Approved') {
    await sendGatedEmail(verification.user_id, 'kyc_notifications', (recipient) =>
      sendKycApprovedEmail(recipient.email, { userName: recipient.name, tier: 'Verified' })
    );
  } else if (payload.status === 'Declined') {
    await sendGatedEmail(verification.user_id, 'kyc_notifications', (recipient) =>
      sendKycRejectedEmail(recipient.email, {
        userName: recipient.name,
        reason: 'Your submitted identity documents could not be verified.',
      })
    );
  }

  // L4: Mark the event only AFTER successful processing so a failed delivery
  // (e.g. UPDATE_FAILED above) is not permanently swallowed — Didit uses
  // at-least-once delivery, so a retry must be able to complete the work.
  if (payload.event_id) {
    processedWebhookEvents.set(payload.event_id, Date.now());
    if (processedWebhookEvents.size > 1000) {
      cleanupProcessedEvents();
    }
  }

  return successResult(updated);
  }); // L4: end withLock
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
      /* istanbul ignore next */
      logger.error('Sync KYC name: User not found', { userId });
      /* istanbul ignore next */
      return;
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ') || user.name || 'User';

    if (fullName && fullName !== 'User') {
      await userRepository.updateUserName(userId, fullName);
      logger.info('Synced KYC name to users table', { userId });
    }

    if (user.role === 'freelancer') {
      const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
      if (existingProfile) {
        logger.info('Freelancer profile already exists', { userId });
        await freelancerProfileRepository.updateProfile(existingProfile.id, {
          name: fullName,
          nationality: nationality,
        });
        logger.info('Updated freelancer profile name from KYC', { userId });
        return;
      }

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
      
      logger.info('Auto-created freelancer profile', { userId });
      
    } else if (user.role === 'employer') {
      const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
      if (existingProfile) {
        /* istanbul ignore next */
        logger.info('Employer profile already exists', { userId });
        await employerProfileRepository.updateProfile(existingProfile.id, {
          name: fullName,
          nationality: nationality,
        });
        /* istanbul ignore next */
        logger.info('Updated employer profile name from KYC', { userId });
        /* istanbul ignore next */
        return;
      }

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
      
      logger.info('Auto-created employer profile', { userId });
    }
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Failed to sync KYC name for user', { userId, error });
    // Don't throw - profile sync failure shouldn't fail the webhook/approval
  }
}

export async function getProfileDataFromKyc(userId: string): Promise<ServiceResult<ProfileDataFromKyc | null>> {
  const verification = await getKycVerificationByUserId(userId);
  
  if (!verification) {
    return errorResult('NO_KYC', 'No KYC verification found for user');
  }

  if (verification.status !== 'approved') {
    return errorResult('KYC_NOT_APPROVED', 'KYC verification is not approved');
  }

  const profileData: ProfileDataFromKyc = {
    name: [verification.first_name, verification.last_name].filter(Boolean).join(' ') || null,
    first_name: verification.first_name ?? null,
    last_name: verification.last_name ?? null,
    nationality: verification.nationality ?? null,
    kyc_verified: true,
    kyc_verified_at: verification.completed_at ?? null,
  };

  return successResult(profileData);
}

type ProfileDataFromKyc = {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  nationality: string | null;
  kyc_verified: boolean;
  kyc_verified_at: string | null;
};

export async function adminReviewVerification(
  verificationId: string,
  adminUserId: string,
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<ServiceResult<KycVerification>> {
  // BLF-12.3: serialize admin reviews per verification so two concurrent submits
  // cannot both pass the status gate and double-approve/double-audit. The status
  // gate (verification.status !== 'completed') alone is not atomic.
  return withLock(`kyc-review:${verificationId}`, async () => {
  const verification = await getKycVerificationById(verificationId);
  if (!verification) {
    return errorResult('VERIFICATION_NOT_FOUND', 'Verification not found');
  }

  if (verification.status !== 'completed') {
    return errorResult('INVALID_STATUS', 'Can only review completed verifications');
  }

  // BLF-7.1: Prevent admin from approving their own KYC to maintain audit integrity
  if (verification.user_id === adminUserId) {
    return errorResult('SELF_REVIEW_FORBIDDEN', 'Admins cannot review their own KYC verification');
  }

  const updates: Partial<KycVerification> = {
    status: decision,
    reviewed_by: adminUserId,
    reviewed_at: new Date().toISOString(),
    ...(notes && { admin_notes: notes }),
  };

  if (decision === 'approved' && !verification.expires_at) {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    updates.expires_at = expiryDate.toISOString();
  }

  const updated = await updateKycVerification(verificationId, updates);
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to update verification');
  }

  if (decision === 'approved') {
    await syncKycNameToUserAndProfiles(
      verification.user_id,
      verification.first_name ?? null,
      verification.last_name ?? null,
      verification.nationality ?? null
    );
  }

  // Transactional email gated by the user's email preferences. Best-effort:
  // a preference lookup or send failure must never break the admin decision.
  await sendGatedEmail(verification.user_id, 'kyc_notifications', (recipient) =>
    decision === 'approved'
      ? sendKycApprovedEmail(recipient.email, { userName: recipient.name, tier: 'Verified' })
      : sendKycRejectedEmail(recipient.email, {
          userName: recipient.name,
          reason: notes?.trim() || 'Your submitted identity documents could not be verified.',
        })
  );

  // BLF-12.2: durable audit trail — record every admin approve/reject decision
  // (who decided, what outcome, on whose verification). Best-effort by design.
  await persistAuditEntry({
    user_id: verification.user_id,
    actor_id: adminUserId,
    action: decision === 'approved' ? 'kyc.approved' : 'kyc.rejected',
    resource_type: 'kyc_verification',
    resource_id: verificationId,
    payload: { decision, ...(notes ? { notes } : {}) },
    ip_address: null,
    user_agent: null,
    status: 'success',
    error_message: null,
  });

  return successResult(updated);
  }); // BLF-12.3: end withLock
}

export async function getPendingAdminReviews(): Promise<ServiceResult<KycVerification[]>> {
  const verifications = await getPendingReviews();
  return successResult(verifications);
}

export async function getVerificationsByStatus(
  status: KycStatus
): Promise<ServiceResult<KycVerification[]>> {
  const verifications = await getKycVerificationsByStatus(status);
  return successResult(verifications);
}

export async function getUserVerificationHistory(
  userId: string
): Promise<ServiceResult<KycVerification[]>> {
  const verifications = await getKycVerificationHistory(userId);
  return successResult(verifications);
}

export async function isUserVerified(userId: string): Promise<boolean> {
  const verification = await getKycVerificationByUserId(userId);
  if (!verification) return false;
  
  if (verification.status !== 'approved') return false;
  
  if (verification.expires_at) {
    const expiryDate = new Date(verification.expires_at);
    if (expiryDate < new Date()) return false;
  }
  
  return true;
}

/**
 * Map Didit session status to our KYC status (v3)
 * Status strings: 'Not Started', 'In Progress', 'Awaiting User', 'In Review',
 * 'Approved', 'Declined', 'Resubmitted', 'Abandoned', 'Expired', 'Kyc Expired'
 */
function mapDiditStatusToKycStatus(diditStatus: string): KycStatus {
  switch (diditStatus) {
    case 'Not Started':
      return 'pending';
    case 'In Progress':
    case 'Awaiting User':
    case 'Resubmitted':
      return 'in_progress';
    case 'Completed':
    case 'Approved':
      return 'approved';
    case 'Declined':
      return 'rejected';
    case 'In Review':
      return 'completed'; // Needs admin review
    case 'Expired':
    case 'Abandoned':
    case 'Kyc Expired':
      return 'expired';
    case 'Cancelled':
    default:
      /* istanbul ignore next */
      logger.warn('Unknown Didit status, defaulting to pending', { diditStatus });
      /* istanbul ignore next */
      return 'pending';
  }
}

type ManualKycParams = {
  userId: string;
  adminUserId: string;
  idFrontImage: Buffer;
  idBackImage?: Buffer;
  selfieImage: Buffer;
};

type ManualIdData = {
  status: string;
  first_name?: string | null;
  last_name?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  document_number?: string | null;
  document_type?: string | null;
  issuing_state?: string | null;
};

type ManualKycChecks = {
  idData: ManualIdData;
  livenessScore: number | undefined;
  faceMatchScore: number | undefined;
};

/**
 * Run the ID document, liveness, and face-match checks against Didit.
 * Returns the verified data or a ServiceResult error on the first failure.
 */
async function runManualKycChecks(params: ManualKycParams): Promise<
  | { error: ServiceResult<KycVerification> }
  | ManualKycChecks
> {
  const { userId, idFrontImage, idBackImage, selfieImage } = params;

  logger.info('Manual KYC: Verifying ID document', { userId });
  const idResult = await verifyIdDocument(idFrontImage, idBackImage, userId);
  if (!idResult.success) {
    return { error: errorResult('ID_VERIFICATION_FAILED', 'ID verification failed') };
  }

  const idData = idResult.data.id_verification as ManualIdData;
  if (idData.status !== 'Approved') {
    return { error: errorResult('ID_DECLINED', 'ID document was declined by Didit') };
  }

  logger.info('Manual KYC: Checking liveness', { userId });
  const livenessResult = await checkPassiveLiveness(selfieImage, userId);
  if (!livenessResult.success) {
    return { error: errorResult('LIVENESS_CHECK_FAILED', 'Liveness check failed') };
  }

  const livenessData = livenessResult.data.passive_liveness as { status: string; score?: number | null };
  if (livenessData.status !== 'Approved') {
    return { error: errorResult('LIVENESS_DECLINED', 'Liveness check declined - possible spoof detected') };
  }

  logger.info('Manual KYC: Matching faces', { userId });
  const faceMatchResult = await matchFaces(selfieImage, idFrontImage, userId);
  if (!faceMatchResult.success) {
    return { error: errorResult('FACE_MATCH_FAILED', 'Face match failed') };
  }

  const faceMatchData = faceMatchResult.data.face_match as { status: string; score?: number | null };
  if (faceMatchData.status !== 'Approved') {
    return { error: errorResult('FACE_MISMATCH', 'Face does not match ID photo') };
  }

  return {
    idData,
    livenessScore: livenessData.score ?? undefined,
    faceMatchScore: faceMatchData.score ?? undefined,
  };
}

/**
 * Run the optional AML screening when the ID provides a full name.
 * Returns true when no AML hits were found (or screening was skipped).
 */
async function runManualKycAmlScreening(idData: ManualIdData, userId: string): Promise<boolean> {
  if (!idData.first_name || !idData.last_name) return true;

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
    logger.warn('Manual KYC: AML screening found hits', {
      userId,
      hits: amlResult.data.aml.total_hits
    });
    return false;
  }

  return true;
}

function buildManualVerificationData(
  params: ManualKycParams,
  checks: ManualKycChecks,
  amlClean: boolean,
): Partial<KycVerification> {
  const { userId, adminUserId } = params;
  const { idData, livenessScore, faceMatchScore } = checks;

  return {
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
    liveness_confidence_score: livenessScore?.toString() || '100',
    face_matched: true,
    face_similarity_score: faceMatchScore?.toString() || '100',
    reviewed_by: amlClean ? adminUserId : null,
    reviewed_at: amlClean ? new Date().toISOString() : null,
    admin_notes: amlClean ? 'Manual verification - all checks passed' : 'Manual verification - AML review required',
    completed_at: new Date().toISOString(),
    expires_at: amlClean ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null, // 1 year
  };
}

async function persistManualVerification(
  existingVerification: KycVerification | null,
  verificationData: Partial<KycVerification>,
): Promise<KycVerification | null> {
  if (existingVerification) {
    return updateKycVerification(existingVerification.id, verificationData);
  }
  return createKycVerification({
    ...verificationData,
    id: generateId(),
  } as Omit<KycVerification, 'created_at' | 'updated_at'>);
}

export async function manualKycVerification(params: ManualKycParams): Promise<ServiceResult<KycVerification>> {
  const { userId, adminUserId } = params;

  if (userId === adminUserId) {
    return errorResult('SELF_REVIEW_FORBIDDEN', 'Admins cannot manually verify their own account');
  }

  // BLF-12.3: serialize manual verifications per target user so two concurrent
  // admin submissions cannot both pass the ALREADY_VERIFIED gate, create duplicate
  // verification records, or write duplicate audit entries.
  return withLock(`kyc-manual:${userId}`, async () => {
    try {
      const user = await userRepository.getUserById(userId);
      if (!user) {
        return errorResult('USER_NOT_FOUND', 'User not found');
      }

      const existingVerification = await getKycVerificationByUserId(userId);
      if (existingVerification && existingVerification.status === 'approved') {
        return errorResult('ALREADY_VERIFIED', 'User is already verified');
      }

      const checks = await runManualKycChecks(params);
      if ('error' in checks) return checks.error;

      const amlClean = await runManualKycAmlScreening(checks.idData, userId);

      const verificationData = buildManualVerificationData(params, checks, amlClean);

      const verification = await persistManualVerification(existingVerification, verificationData);
      if (!verification) {
        /* istanbul ignore next */
        return errorResult('DATABASE_ERROR', 'Failed to save verification');
      }

      if (amlClean) {
        await syncKycNameToUserAndProfiles(
          userId,
          checks.idData.first_name || null,
          checks.idData.last_name || null,
          checks.idData.nationality || null
        );

        // Transactional email gated by the user's email preferences. Best-effort.
        await sendGatedEmail(userId, 'kyc_notifications', (recipient) =>
          sendKycApprovedEmail(recipient.email, { userName: recipient.name, tier: 'Verified' })
        );
      }

      logger.info('Manual KYC verification completed', {
        userId,
        verificationId: verification.id,
        status: verification.status,
        amlClean
      });

      // BLF-12.2: durable audit trail — record the admin-performed manual
      // verification, including whether AML screening passed or needs review.
      await persistAuditEntry({
        user_id: userId,
        actor_id: params.adminUserId,
        action: 'kyc.manual_verified',
        resource_type: 'kyc_verification',
        resource_id: verification.id,
        payload: { status: verification.status, amlClean },
        ip_address: null,
        user_agent: null,
        status: 'success',
        error_message: null,
      });

      return successResult(verification);
    } catch (error) {
      logger.error('Manual KYC verification error', error as Error, { userId });
      return errorResult('VERIFICATION_ERROR', error instanceof Error ? error.message : 'Manual verification failed');
    }
  }); // BLF-12.3: end withLock
}


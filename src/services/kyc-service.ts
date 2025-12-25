import { kycRepository } from '../repositories/kyc-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import {
  KycVerification,
  KycSubmissionInput,
  KycReviewInput,
  KycStatus,
  KycDocument,
  LivenessCheck,
  LivenessSessionInput,
  LivenessVerificationInput,
  FaceMatchInput,
  SupportedCountry,
  DocumentType,
  KycTier,
} from '../models/kyc.js';
import { generateId } from '../utils/id.js';

export type KycError = {
  code: string;
  message: string;
};

export type KycResult<T> = T | KycError;

export function isKycError(result: KycResult<unknown>): result is KycError {
  return typeof result === 'object' && result !== null && 'code' in result;
}

// Supported countries with their KYC requirements
const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { code: 'US', name: 'United States', supportedDocuments: ['passport', 'drivers_license', 'national_id'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'GB', name: 'United Kingdom', supportedDocuments: ['passport', 'drivers_license', 'national_id'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'CA', name: 'Canada', supportedDocuments: ['passport', 'drivers_license'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'AU', name: 'Australia', supportedDocuments: ['passport', 'drivers_license'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'DE', name: 'Germany', supportedDocuments: ['passport', 'national_id', 'residence_permit'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'FR', name: 'France', supportedDocuments: ['passport', 'national_id', 'residence_permit'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'JP', name: 'Japan', supportedDocuments: ['passport', 'drivers_license', 'residence_permit'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'SG', name: 'Singapore', supportedDocuments: ['passport', 'national_id'], requiresLiveness: true, requiresAddressProof: false, tier: 'standard' },
  { code: 'AE', name: 'United Arab Emirates', supportedDocuments: ['passport', 'national_id', 'residence_permit'], requiresLiveness: true, requiresAddressProof: true, tier: 'enhanced' },
  { code: 'IN', name: 'India', supportedDocuments: ['passport', 'national_id', 'voter_id', 'drivers_license'], requiresLiveness: true, requiresAddressProof: true, tier: 'standard' },
  { code: 'PH', name: 'Philippines', supportedDocuments: ['passport', 'national_id', 'drivers_license', 'voter_id'], requiresLiveness: true, requiresAddressProof: false, tier: 'standard' },
  { code: 'BR', name: 'Brazil', supportedDocuments: ['passport', 'national_id', 'drivers_license'], requiresLiveness: true, requiresAddressProof: true, tier: 'standard' },
  { code: 'MX', name: 'Mexico', supportedDocuments: ['passport', 'national_id', 'voter_id'], requiresLiveness: true, requiresAddressProof: false, tier: 'standard' },
  { code: 'NG', name: 'Nigeria', supportedDocuments: ['passport', 'national_id', 'voter_id', 'drivers_license'], requiresLiveness: true, requiresAddressProof: false, tier: 'basic' },
  { code: 'KE', name: 'Kenya', supportedDocuments: ['passport', 'national_id'], requiresLiveness: true, requiresAddressProof: false, tier: 'basic' },
  { code: 'ZA', name: 'South Africa', supportedDocuments: ['passport', 'national_id', 'drivers_license'], requiresLiveness: true, requiresAddressProof: true, tier: 'standard' },
];

const LIVENESS_SESSION_EXPIRY_MINUTES = 10;
const LIVENESS_CONFIDENCE_THRESHOLD = 0.85;
const FACE_MATCH_THRESHOLD = 0.80;

export function getSupportedCountries(): SupportedCountry[] {
  return SUPPORTED_COUNTRIES;
}

export function getCountryRequirements(countryCode: string): SupportedCountry | null {
  return SUPPORTED_COUNTRIES.find(c => c.code === countryCode) ?? null;
}

export function isCountrySupported(countryCode: string): boolean {
  return SUPPORTED_COUNTRIES.some(c => c.code === countryCode);
}

export function isDocumentTypeSupported(countryCode: string, documentType: DocumentType): boolean {
  const country = getCountryRequirements(countryCode);
  return country?.supportedDocuments.includes(documentType) ?? false;
}

export async function getKycStatus(userId: string): Promise<KycResult<KycVerification | null>> {
  return kycRepository.getKycByUserId(userId);
}

export async function submitKyc(userId: string, input: KycSubmissionInput): Promise<KycResult<KycVerification>> {
  const user = await userRepository.getUserById(userId);
  if (!user) return { code: 'USER_NOT_FOUND', message: 'User not found' };

  // Validate country support
  if (!isCountrySupported(input.address.countryCode)) {
    return { code: 'COUNTRY_NOT_SUPPORTED', message: `KYC not available for country: ${input.address.countryCode}` };
  }

  // Validate document type for country
  if (!isDocumentTypeSupported(input.address.countryCode, input.document.type)) {
    return { code: 'DOCUMENT_TYPE_NOT_SUPPORTED', message: `Document type ${input.document.type} not supported for ${input.address.countryCode}` };
  }

  const existingKyc = await kycRepository.getKycByUserId(userId);
  if (existingKyc?.status === 'approved') {
    return { code: 'KYC_ALREADY_APPROVED', message: 'KYC verification already approved' };
  }
  if (existingKyc && (existingKyc.status === 'submitted' || existingKyc.status === 'under_review')) {
    return { code: 'KYC_PENDING', message: 'KYC verification already pending review' };
  }

  const countryReqs = getCountryRequirements(input.address.countryCode);
  const tier: KycTier = input.tier ?? countryReqs?.tier ?? 'basic';

  const now = new Date().toISOString();
  const document: KycDocument = {
    id: generateId(),
    type: input.document.type,
    documentNumber: input.document.documentNumber,
    issuingCountry: input.document.issuingCountry,
    issuingAuthority: input.document.issuingAuthority,
    issueDate: input.document.issueDate,
    expiryDate: input.document.expiryDate,
    frontImageUrl: input.document.frontImageUrl,
    backImageUrl: input.document.backImageUrl,
    verificationStatus: 'pending',
    uploadedAt: now,
  };

  const kyc: KycVerification = {
    id: existingKyc?.id ?? generateId(),
    userId,
    status: 'submitted',
    tier,
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    placeOfBirth: input.placeOfBirth,
    nationality: input.nationality,
    secondaryNationality: input.secondaryNationality,
    taxResidenceCountry: input.taxResidenceCountry,
    taxIdentificationNumber: input.taxIdentificationNumber,
    address: {
      addressLine1: input.address.addressLine1,
      addressLine2: input.address.addressLine2,
      city: input.address.city,
      stateProvince: input.address.stateProvince,
      postalCode: input.address.postalCode,
      country: input.address.country,
      countryCode: input.address.countryCode,
    },
    documents: existingKyc ? [...existingKyc.documents, document] : [document],
    selfieImageUrl: input.selfieImageUrl,
    amlScreeningStatus: 'pending',
    submittedAt: now,
    createdAt: existingKyc?.createdAt ?? now,
    updatedAt: now,
  };

  if (existingKyc) {
    const updated = await kycRepository.updateKyc(kyc.id, userId, kyc);
    return updated ?? { code: 'UPDATE_FAILED', message: 'Failed to update KYC' };
  }

  return kycRepository.createKyc(kyc);
}


export async function createLivenessSession(
  userId: string,
  input?: LivenessSessionInput
): Promise<KycResult<LivenessCheck>> {
  const kyc = await kycRepository.getKycByUserId(userId);
  if (!kyc) {
    return { code: 'KYC_NOT_FOUND', message: 'Please submit KYC information first' };
  }

  if (kyc.status === 'approved') {
    return { code: 'KYC_ALREADY_APPROVED', message: 'KYC already approved' };
  }

  // Default challenges for liveness check
  const defaultChallenges: LivenessCheck['challenges'][0]['type'][] = ['blink', 'turn_left', 'turn_right', 'smile'];
  const challengeTypes = input?.challenges ?? defaultChallenges;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LIVENESS_SESSION_EXPIRY_MINUTES * 60 * 1000);

  const livenessCheck: LivenessCheck = {
    id: generateId(),
    sessionId: generateId(),
    status: 'pending',
    confidenceScore: 0,
    challenges: challengeTypes.map(type => ({ type, completed: false })),
    capturedFrames: [],
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  };

  const updates: Partial<KycVerification> = {
    livenessCheck,
    updatedAt: now.toISOString(),
  };

  const updated = await kycRepository.updateKyc(kyc.id, userId, updates);
  if (!updated) {
    return { code: 'UPDATE_FAILED', message: 'Failed to create liveness session' };
  }

  return livenessCheck;
}

export async function verifyLiveness(
  userId: string,
  input: LivenessVerificationInput
): Promise<KycResult<LivenessCheck>> {
  const kyc = await kycRepository.getKycByUserId(userId);
  if (!kyc) {
    return { code: 'KYC_NOT_FOUND', message: 'KYC verification not found' };
  }

  if (!kyc.livenessCheck) {
    return { code: 'NO_LIVENESS_SESSION', message: 'No active liveness session. Create one first.' };
  }

  if (kyc.livenessCheck.sessionId !== input.sessionId) {
    return { code: 'INVALID_SESSION', message: 'Invalid liveness session ID' };
  }

  const now = new Date();
  if (new Date(kyc.livenessCheck.expiresAt) < now) {
    const expiredCheck: LivenessCheck = { ...kyc.livenessCheck, status: 'expired' };
    await kycRepository.updateKyc(kyc.id, userId, { livenessCheck: expiredCheck, updatedAt: now.toISOString() });
    return { code: 'SESSION_EXPIRED', message: 'Liveness session has expired. Please create a new one.' };
  }

  // Update challenges with results
  const updatedChallenges = kyc.livenessCheck.challenges.map(challenge => {
    const result = input.challengeResults.find(r => r.type === challenge.type);
    return result ? { ...challenge, completed: result.completed, timestamp: result.timestamp } : challenge;
  });

  const allChallengesCompleted = updatedChallenges.every(c => c.completed);
  
  // Simulate confidence score calculation (in production, use ML model)
  const completedCount = updatedChallenges.filter(c => c.completed).length;
  const confidenceScore = (completedCount / updatedChallenges.length) * (0.85 + Math.random() * 0.15);

  const status: LivenessCheck['status'] = 
    allChallengesCompleted && confidenceScore >= LIVENESS_CONFIDENCE_THRESHOLD ? 'passed' : 
    allChallengesCompleted ? 'failed' : 'pending';

  const updatedLivenessCheck: LivenessCheck = {
    ...kyc.livenessCheck,
    challenges: updatedChallenges,
    capturedFrames: input.capturedFrames,
    confidenceScore,
    status,
    completedAt: allChallengesCompleted ? now.toISOString() : undefined,
  };

  const updates: Partial<KycVerification> = {
    livenessCheck: updatedLivenessCheck,
    updatedAt: now.toISOString(),
  };

  await kycRepository.updateKyc(kyc.id, userId, updates);
  return updatedLivenessCheck;
}

export async function verifyFaceMatch(
  userId: string,
  input: FaceMatchInput
): Promise<KycResult<{ matched: boolean; score: number }>> {
  const kyc = await kycRepository.getKycByUserId(userId);
  if (!kyc) {
    return { code: 'KYC_NOT_FOUND', message: 'KYC verification not found' };
  }

  // Simulate face matching (in production, use face recognition API)
  const faceMatchScore = 0.75 + Math.random() * 0.25;
  const matched = faceMatchScore >= FACE_MATCH_THRESHOLD;

  const now = new Date().toISOString();
  const updates: Partial<KycVerification> = {
    selfieImageUrl: input.selfieImageUrl,
    faceMatchScore,
    faceMatchStatus: matched ? 'matched' : 'not_matched',
    updatedAt: now,
  };

  await kycRepository.updateKyc(kyc.id, userId, updates);
  return { matched, score: faceMatchScore };
}

export async function getLivenessSession(userId: string): Promise<KycResult<LivenessCheck | null>> {
  const kyc = await kycRepository.getKycByUserId(userId);
  if (!kyc) {
    return { code: 'KYC_NOT_FOUND', message: 'KYC verification not found' };
  }
  return kyc.livenessCheck ?? null;
}

export async function reviewKyc(
  kycId: string,
  reviewerId: string,
  input: KycReviewInput
): Promise<KycResult<KycVerification>> {
  const pendingKycs = await kycRepository.getKycByStatus('submitted');
  const underReviewKycs = await kycRepository.getKycByStatus('under_review');
  const allKycs = [...pendingKycs, ...underReviewKycs];
  
  const kyc = allKycs.find(k => k.id === kycId);
  if (!kyc) {
    return { code: 'KYC_NOT_FOUND', message: 'KYC verification not found or not pending review' };
  }

  if (input.status === 'rejected' && !input.rejectionReason) {
    return { code: 'REJECTION_REASON_REQUIRED', message: 'Rejection reason is required' };
  }

  const now = new Date().toISOString();
  const updates: Partial<KycVerification> = {
    status: input.status,
    reviewedAt: now,
    reviewedBy: reviewerId,
    riskLevel: input.riskLevel,
    riskScore: input.riskScore,
    amlScreeningStatus: input.amlScreeningStatus,
    amlScreeningNotes: input.amlScreeningNotes,
    updatedAt: now,
  };

  if (input.status === 'rejected') {
    updates.rejectionReason = input.rejectionReason;
    updates.rejectionCode = input.rejectionCode;
  }

  if (input.status === 'approved') {
    // Set expiry for approved KYC (1 year)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    updates.expiresAt = expiresAt.toISOString();
  }

  const updated = await kycRepository.updateKyc(kycId, kyc.userId, updates);
  return updated ?? { code: 'UPDATE_FAILED', message: 'Failed to update KYC' };
}

export async function getPendingKycReviews(): Promise<KycVerification[]> {
  return kycRepository.getPendingReviews();
}

export async function getAllKycByStatus(status: KycStatus): Promise<KycVerification[]> {
  return kycRepository.getKycByStatus(status);
}

export async function addDocument(
  userId: string,
  document: {
    type: KycDocument['type'];
    documentNumber: string;
    issuingCountry: string;
    issuingAuthority?: string;
    issueDate?: string;
    expiryDate?: string;
    frontImageUrl: string;
    backImageUrl?: string;
  }
): Promise<KycResult<KycVerification>> {
  const kyc = await kycRepository.getKycByUserId(userId);
  if (!kyc) {
    return { code: 'KYC_NOT_FOUND', message: 'No KYC verification found. Please submit KYC first.' };
  }

  if (kyc.status === 'approved') {
    return { code: 'KYC_ALREADY_APPROVED', message: 'Cannot modify approved KYC' };
  }

  const now = new Date().toISOString();
  const newDocument: KycDocument = {
    id: generateId(),
    ...document,
    verificationStatus: 'pending',
    uploadedAt: now,
  };

  const updates: Partial<KycVerification> = {
    documents: [...kyc.documents, newDocument],
    updatedAt: now,
  };

  const updated = await kycRepository.updateKyc(kyc.id, userId, updates);
  return updated ?? { code: 'UPDATE_FAILED', message: 'Failed to add document' };
}

export function isKycApproved(kyc: KycVerification | null): boolean {
  return kyc?.status === 'approved';
}

export function isKycComplete(kyc: KycVerification | null): boolean {
  if (!kyc) return false;
  
  const hasDocuments = kyc.documents.length > 0;
  const hasLiveness = kyc.livenessCheck?.status === 'passed';
  const hasFaceMatch = kyc.faceMatchStatus === 'matched';
  
  return hasDocuments && hasLiveness && hasFaceMatch;
}

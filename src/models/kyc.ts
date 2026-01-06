export type KycStatus = 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export type DocumentType = 
  | 'passport' 
  | 'national_id' 
  | 'drivers_license' 
  | 'residence_permit'
  | 'voter_id'
  | 'tax_id'
  | 'social_security'
  | 'birth_certificate'
  | 'utility_bill'
  | 'bank_statement';

export type LivenessCheckStatus = 'pending' | 'passed' | 'failed' | 'expired';

export type LivenessCheck = {
  id: string;
  sessionId: string;
  status: LivenessCheckStatus;
  confidenceScore: number;
  challenges: LivenessChallenge[];
  capturedFrames: string[];
  completedAt?: string | undefined;
  expiresAt: string;
  createdAt: string;
};

export type LivenessChallenge = {
  type: 'blink' | 'smile' | 'turn_left' | 'turn_right' | 'nod' | 'open_mouth';
  completed: boolean;
  timestamp?: string | undefined;
};

export type KycDocument = {
  id: string;
  type: DocumentType;
  documentNumber: string;
  issuingCountry: string;
  issuingAuthority?: string | undefined;
  issueDate?: string | undefined;
  expiryDate?: string | undefined;
  frontImageUrl: string;
  backImageUrl?: string | undefined;
  mrzData?: MrzData | undefined;
  ocrExtractedData?: OcrExtractedData | undefined;
  verificationStatus: 'pending' | 'verified' | 'failed';
  verificationNotes?: string | undefined;
  uploadedAt: string;
};

export type MrzData = {
  documentType: string;
  issuingCountry: string;
  lastName: string;
  firstName: string;
  documentNumber: string;
  nationality: string;
  dateOfBirth: string;
  sex: string;
  expiryDate: string;
  personalNumber?: string | undefined;
};

export type OcrExtractedData = {
  fullName?: string | undefined;
  dateOfBirth?: string | undefined;
  documentNumber?: string | undefined;
  expiryDate?: string | undefined;
  address?: string | undefined;
  rawText?: string | undefined;
};

export type InternationalAddress = {
  addressLine1: string;
  addressLine2?: string | undefined;
  city: string;
  stateProvince?: string | undefined;
  postalCode?: string | undefined;
  country: string;
  countryCode: string;
};

export type KycVerification = {
  id: string;
  userId: string;
  status: KycStatus;
  tier: KycTier;
  firstName: string;
  middleName?: string | undefined;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth?: string | undefined;
  nationality: string;
  secondaryNationality?: string | undefined;
  taxResidenceCountry?: string | undefined;
  taxIdentificationNumber?: string | undefined;
  address: InternationalAddress;
  documents: KycDocument[];
  livenessCheck?: LivenessCheck | undefined;
  faceMatchScore?: number | undefined;
  faceMatchStatus?: 'pending' | 'matched' | 'not_matched' | undefined;
  selfieImageUrl?: string | undefined;
  videoVerificationUrl?: string | undefined;
  amlScreeningStatus?: 'pending' | 'clear' | 'flagged' | 'review_required' | undefined;
  amlScreeningNotes?: string | undefined;
  pepStatus?: boolean | undefined;
  sanctionsStatus?: boolean | undefined;
  riskLevel?: 'low' | 'medium' | 'high' | undefined;
  riskScore?: number | undefined;
  submittedAt?: string | undefined;
  reviewedAt?: string | undefined;
  reviewedBy?: string | undefined;
  rejectionReason?: string | undefined;
  rejectionCode?: KycRejectionCode | undefined;
  expiresAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type KycTier = 'basic' | 'standard' | 'enhanced';

export type KycRejectionCode = 
  | 'DOCUMENT_EXPIRED'
  | 'DOCUMENT_UNREADABLE'
  | 'DOCUMENT_TAMPERED'
  | 'FACE_MISMATCH'
  | 'LIVENESS_FAILED'
  | 'AML_FLAGGED'
  | 'SANCTIONS_MATCH'
  | 'PEP_MATCH'
  | 'INCOMPLETE_INFO'
  | 'FRAUDULENT_ACTIVITY'
  | 'OTHER';

export type KycSubmissionInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth?: string;
  nationality: string;
  secondaryNationality?: string;
  taxResidenceCountry?: string;
  taxIdentificationNumber?: string;
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateProvince?: string;
    postalCode?: string;
    country: string;
    countryCode: string;
  };
  document: {
    type: DocumentType;
    documentNumber: string;
    issuingCountry: string;
    issuingAuthority?: string;
    issueDate?: string;
    expiryDate?: string;
    frontImageUrl: string;
    backImageUrl?: string;
  };
  selfieImageUrl?: string;
  tier?: KycTier;
};

export type LivenessSessionInput = {
  challenges?: LivenessChallenge['type'][];
};

export type LivenessVerificationInput = {
  sessionId: string;
  capturedFrames: string[];
  challengeResults: {
    type: LivenessChallenge['type'];
    completed: boolean;
    timestamp: string;
  }[];
};

export type FaceMatchInput = {
  selfieImageUrl: string;
  documentImageUrl: string;
};

export type KycReviewInput = {
  status: 'approved' | 'rejected';
  rejectionReason?: string;
  rejectionCode?: KycRejectionCode;
  riskLevel?: 'low' | 'medium' | 'high';
  riskScore?: number;
  amlScreeningStatus?: 'clear' | 'flagged' | 'review_required';
  amlScreeningNotes?: string;
};

export type SupportedCountry = {
  code: string;
  name: string;
  supportedDocuments: DocumentType[];
  requiresLiveness: boolean;
  requiresAddressProof: boolean;
  tier: KycTier;
};

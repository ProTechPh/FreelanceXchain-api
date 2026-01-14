/**
 * Didit KYC API Types
 * Based on Didit API documentation: https://docs.didit.me/reference/
 */

// Session Management Types
export type DiditSessionStatus = 
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Expired'
  | 'Cancelled';

export type DiditVerificationDecision = 'approved' | 'declined' | 'review';

export type DiditCreateSessionRequest = {
  workflow_id: string;
  callback?: string;
  vendor_data?: string;
  metadata?: Record<string, string | number | boolean>;
  contact_details?: {
    email?: string;
    email_lang?: string;
    phone?: string;
  };
};

export type DiditCreateSessionResponse = {
  session_id: string;
  session_number: number;
  session_token: string;
  vendor_data?: string;
  metadata?: Record<string, string | number | boolean>;
  status: DiditSessionStatus;
  workflow_id: string;
  callback?: string;
  url: string;
};

// ID Verification Types
export type DiditDocumentType = 
  | 'passport'
  | 'id_card'
  | 'drivers_license'
  | 'residence_permit'
  | 'visa';

export type DiditDocumentVerification = {
  document_type: DiditDocumentType;
  document_number?: string;
  issuing_country?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  expiry_date?: string;
  nationality?: string;
  sex?: string;
  mrz_verified?: boolean;
  document_front_image?: string;
  document_back_image?: string;
  face_image?: string;
  verification_status: 'verified' | 'failed' | 'pending';
  verification_checks?: {
    document_authenticity?: boolean;
    data_consistency?: boolean;
    expiry_validation?: boolean;
    visual_authenticity?: boolean;
  };
};

// Liveness Detection Types
export type DiditLivenessDetection = {
  liveness_status: 'passed' | 'failed' | 'pending';
  confidence_score?: number;
  liveness_type: 'passive' | 'active';
  spoofing_detected?: boolean;
  frame_count?: number;
  timestamp?: string;
};

// Face Match Types
export type DiditFaceMatch = {
  match_status: 'matched' | 'not_matched' | 'pending';
  similarity_score?: number;
  threshold?: number;
  selfie_image?: string;
  document_face_image?: string;
  timestamp?: string;
};

// IP Analysis Types
export type DiditIpAnalysis = {
  ip_address: string;
  country_code?: string;
  country_name?: string;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  risk_score?: number;
  is_vpn?: boolean;
  is_proxy?: boolean;
  is_tor?: boolean;
  is_datacenter?: boolean;
  threat_level?: 'low' | 'medium' | 'high';
};

// Complete Verification Decision Response
export type DiditVerificationDecisionResponse = {
  session_id: string;
  session_number: number;
  status: DiditSessionStatus;
  decision: DiditVerificationDecision;
  workflow_id: string;
  vendor_data?: string;
  metadata?: Record<string, string | number | boolean>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  
  // Feature results (based on workflow configuration)
  id_verification?: DiditDocumentVerification;
  liveness_detection?: DiditLivenessDetection;
  face_match?: DiditFaceMatch;
  ip_analysis?: DiditIpAnalysis;
  
  // Additional fields
  decline_reasons?: string[];
  review_reasons?: string[];
};

// Webhook Types
export type DiditWebhookEvent = 
  | 'session.created'
  | 'session.in_progress'
  | 'session.completed'
  | 'session.expired'
  | 'session.cancelled';

export type DiditWebhookPayload = {
  event: DiditWebhookEvent;
  session_id: string;
  session_number: number;
  status: DiditSessionStatus;
  decision?: DiditVerificationDecision;
  workflow_id: string;
  vendor_data?: string;
  metadata?: Record<string, string | number | boolean>;
  timestamp: string;
};

// Error Types
export type DiditApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

// Local Database Types (Supabase)
export type KycStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected' | 'expired';

export type KycVerification = {
  id: string;
  user_id: string;
  status: KycStatus;
  
  // Didit session info
  didit_session_id: string;
  didit_session_token: string;
  didit_session_url: string;
  didit_workflow_id: string;
  
  // Verification decision
  decision?: DiditVerificationDecision;
  decline_reasons?: string[];
  review_reasons?: string[];
  
  // ID Verification results
  document_type?: DiditDocumentType;
  document_number?: string;
  issuing_country?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  nationality?: string;
  document_verified?: boolean;
  
  // Liveness results
  liveness_passed?: boolean;
  liveness_confidence_score?: number;
  spoofing_detected?: boolean;
  
  // Face match results
  face_matched?: boolean;
  face_similarity_score?: number;
  
  // IP Analysis results
  ip_address?: string;
  ip_country_code?: string;
  ip_risk_score?: number;
  is_vpn?: boolean;
  is_proxy?: boolean;
  threat_level?: 'low' | 'medium' | 'high';
  
  // Metadata
  vendor_data?: string;
  metadata?: Record<string, unknown>;
  
  // Admin review
  reviewed_by?: string;
  reviewed_at?: string;
  admin_notes?: string;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string;
  expires_at?: string;
};

export type CreateKycVerificationInput = {
  user_id: string;
  vendor_data?: string;
  metadata?: Record<string, string | number | boolean>;
  contact_details?: {
    email?: string;
    phone?: string;
  };
};

export type UpdateKycVerificationInput = Partial<Omit<KycVerification, 'id' | 'user_id' | 'created_at'>>;

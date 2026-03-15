/**
 * Didit KYC API Types
 * Based on Didit API documentation: https://docs.didit.me/reference/
 * 
 * Note: Didit handles all verification data (documents, liveness, face match, IP analysis).
 * We only store session info and final decision locally.
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

// Decision endpoint response
export type DiditVerificationDecisionResponse = {
  session_id: string;
  decision: DiditVerificationDecision;
  status: DiditSessionStatus;
  vendor_data?: string;
  metadata?: Record<string, string | number | boolean>;
};

// Webhook Types
export type DiditWebhookType = 'status.updated' | 'data.updated';

export type DiditWebhookStatus = 
  | 'Not Started'
  | 'In Progress'
  | 'Approved'
  | 'Declined'
  | 'In Review'
  | 'Expired'
  | 'Abandoned';

export type DiditWebhookPayload = {
  webhook_type: DiditWebhookType;
  session_id: string;
  status: DiditWebhookStatus;
  timestamp: number;
  created_at: number;
  vendor_data?: string;
  workflow_id?: string;
  metadata?: Record<string, string | number | boolean>;
  decision?: DiditDecisionData;
};

// Decision data included when status is Approved/Declined/In Review
export type DiditDecisionData = {
  session_id: string;
  session_number: number;
  session_url: string;
  status: DiditWebhookStatus;
  vendor_data?: string;
  workflow_id?: string;
  features: string[];
  id_verifications?: DiditIdVerification[];
  liveness_checks?: DiditLivenessCheck[];
  face_matches?: DiditFaceMatch[];
  ip_analyses?: DiditIpAnalysis[];
  reviews?: unknown[];
  created_at: string;
};

export type DiditIdVerification = {
  node_id: string;
  status: string;
  document_type: string;
  document_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  gender?: string;
  nationality?: string;
  issuing_state: string;
  issuing_state_name: string;
  address?: string;
  formatted_address?: string;
  age?: number;
  warnings?: DiditWarning[];
};

export type DiditLivenessCheck = {
  node_id: string;
  status: string;
  method: string;
  score: number;
  age_estimation?: number;
  reference_image?: string;
  warnings?: DiditWarning[];
};

export type DiditFaceMatch = {
  node_id: string;
  status: string;
  score: number;
  source_image?: string;
  target_image?: string;
  warnings?: DiditWarning[];
};

export type DiditIpAnalysis = {
  node_id: string;
  status: string;
  ip_address: string;
  ip_country: string;
  ip_country_code: string;
  ip_city?: string;
  is_vpn_or_tor: boolean;
  is_data_center: boolean;
  latitude?: number;
  longitude?: number;
  warnings?: DiditWarning[];
};

export type DiditWarning = {
  feature: string;
  risk: string;
  short_description: string;
  long_description?: string;
  log_type?: string;
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
  didit_session_token: string | null;
  didit_session_url: string | null;
  didit_workflow_id: string;
  
  // Verification decision from Didit
  decision?: DiditVerificationDecision | null;
  decline_reasons?: string[] | null;
  review_reasons?: string[] | null;
  
  // Document info (from Didit)
  document_type?: string | null;
  document_number?: string | null;
  issuing_country?: string | null;
  
  // Personal info (from Didit)
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  
  // Verification results
  document_verified?: boolean | null;
  liveness_passed?: boolean | null;
  liveness_confidence_score?: string | null;
  spoofing_detected?: boolean | null;
  face_matched?: boolean | null;
  face_similarity_score?: string | null;
  
  // IP analysis
  ip_address?: string | null;
  ip_country_code?: string | null;
  ip_risk_score?: string | null;
  is_vpn?: boolean | null;
  is_proxy?: boolean | null;
  threat_level?: string | null;
  
  // Additional data
  vendor_data?: string | null;
  metadata?: Record<string, unknown> | null;
  
  // Admin review
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  expires_at?: string | null;
};

export type CreateKycVerificationInput = {
  user_id: string;
};

export type UpdateKycVerificationInput = Partial<Omit<KycVerification, 'id' | 'user_id' | 'created_at'>>;

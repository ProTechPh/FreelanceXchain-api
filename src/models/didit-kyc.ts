// Didit KYC API types — https://docs.didit.me/reference/
// Didit handles verification data; we store session info and final decision locally.

type DiditSessionStatus = 
  | 'Not Started'
  | 'In Progress'
  | 'Awaiting User'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Resubmitted'
  | 'Abandoned'
  | 'Expired'
  | 'Kyc Expired'
  | 'Completed'
  | 'Cancelled';

type DiditVerificationDecision = 'approved' | 'declined' | 'review';

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

export type DiditVerificationDecisionResponse = {
  session_id: string;
  decision: DiditVerificationDecision;
  status: DiditSessionStatus;
  vendor_data?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type DiditWebhookType = 'status.updated' | 'data.updated';

export type DiditWebhookStatus = 
  | 'Not Started'
  | 'In Progress'
  | 'Awaiting User'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Resubmitted'
  | 'Abandoned'
  | 'Expired'
  | 'Kyc Expired';

export type DiditWebhookPayload = {
  event_id: string;
  webhook_type: DiditWebhookType;
  session_id: string;
  status: DiditWebhookStatus;
  timestamp: number;
  created_at: number;
  application_id?: string;
  vendor_data?: string;
  workflow_id?: string;
  workflow_version?: number;
  session_kind?: string;
  metadata?: Record<string, string | number | boolean>;
  decision?: DiditDecisionData;
};

// Included when status is Approved/Declined/In Review
type DiditDecisionData = {
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

type DiditIdVerification = {
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

type DiditLivenessCheck = {
  node_id: string;
  status: string;
  method: string;
  score: number;
  age_estimation?: number;
  reference_image?: string;
  warnings?: DiditWarning[];
};

type DiditFaceMatch = {
  node_id: string;
  status: string;
  score: number;
  source_image?: string;
  target_image?: string;
  warnings?: DiditWarning[];
};

type DiditIpAnalysis = {
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

type DiditWarning = {
  feature: string;
  risk: string;
  short_description: string;
  long_description?: string;
  log_type?: string;
};

export type DiditApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type KycStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected' | 'expired';

export type KycVerification = {
  id: string;
  user_id: string;
  status: KycStatus;

  didit_session_id: string;
  didit_session_token: string | null;
  didit_session_url: string | null;
  didit_workflow_id: string;

  decision?: DiditVerificationDecision | null;
  decline_reasons?: string[] | null;
  review_reasons?: string[] | null;

  document_type?: string | null;
  document_number?: string | null;
  issuing_country?: string | null;

  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;

  document_verified?: boolean | null;
  liveness_passed?: boolean | null;
  liveness_confidence_score?: string | null;
  spoofing_detected?: boolean | null;
  face_matched?: boolean | null;
  face_similarity_score?: string | null;

  ip_address?: string | null;
  ip_country_code?: string | null;
  ip_risk_score?: string | null;
  is_vpn?: boolean | null;
  is_proxy?: boolean | null;
  threat_level?: string | null;

  vendor_data?: string | null;
  metadata?: Record<string, unknown> | null;

  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;

  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  expires_at?: string | null;
};

export type CreateKycVerificationInput = {
  user_id: string;
};

export type UpdateKycVerificationInput = Partial<Omit<KycVerification, 'id' | 'user_id' | 'created_at'>>;

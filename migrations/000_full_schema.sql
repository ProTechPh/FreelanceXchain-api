-- =============================================================================
-- FreelanceXchain API — Full Database Schema
-- Run this file to create all tables, indexes, and constraints
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. USERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL CHECK (role IN ('freelancer', 'employer', 'admin')),
  wallet_address VARCHAR(42) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL DEFAULT 'User',
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspension_reason TEXT,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users (wallet_address) WHERE wallet_address != '';

-- =============================================================================
-- 2. SKILL CATEGORIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS skill_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_categories_name ON skill_categories (name);
CREATE INDEX IF NOT EXISTS idx_skill_categories_active ON skill_categories (is_active) WHERE is_active = TRUE;

-- =============================================================================
-- 3. SKILLS
-- =============================================================================
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES skill_categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills (category_id);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills (name);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills (is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name_category ON skills (name, category_id);

-- =============================================================================
-- 4. FREELANCER PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS freelancer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  nationality VARCHAR(100),
  bio TEXT NOT NULL DEFAULT '',
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  skills JSONB NOT NULL DEFAULT '[]',
  experience JSONB NOT NULL DEFAULT '[]',
  availability VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'unavailable')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_freelancer_profiles_user ON freelancer_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_profiles_availability ON freelancer_profiles (availability);

-- =============================================================================
-- 5. EMPLOYER PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS employer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  nationality VARCHAR(100),
  company_name VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  industry VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employer_profiles_user ON employer_profiles (user_id);

-- =============================================================================
-- 6. PROJECTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  required_skills JSONB NOT NULL DEFAULT '[]',
  budget DECIMAL(12,2) NOT NULL DEFAULT 0,
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  is_rush BOOLEAN NOT NULL DEFAULT FALSE,
  rush_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'in_progress', 'completed', 'cancelled')),
  milestones JSONB NOT NULL DEFAULT '[]',
  freelancer_limit INTEGER NOT NULL DEFAULT 1,
  tags JSONB NOT NULL DEFAULT '[]',
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_employer ON projects (employer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_budget ON projects (budget);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_skills ON projects USING GIN (required_skills);

-- =============================================================================
-- 7. PROJECT MILESTONES (for row-level locking in disputes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones (project_id);

-- =============================================================================
-- 8. PROPOSALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT,
  attachments JSONB NOT NULL DEFAULT '[]',
  proposed_rate DECIMAL(12,2) NOT NULL,
  estimated_duration INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals (project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer ON proposals (freelancer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals (status);

-- =============================================================================
-- 9. CONTRACTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  escrow_address VARCHAR(42) DEFAULT '',
  base_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  rush_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'disputed', 'resolved', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts (project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_proposal ON contracts (proposal_id);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer ON contracts (freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_employer ON contracts (employer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);

-- =============================================================================
-- 10. MILESTONES (separate table for tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount DECIMAL(12,2) NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'disputed', 'completed')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  deliverable_files JSONB NOT NULL DEFAULT '[]',
  rejection_reason TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_contract ON milestones (contract_id);

-- =============================================================================
-- 11. REVIEWS
-- =============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating DECIMAL(3,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  reviewer_role VARCHAR(20) CHECK (reviewer_role IN ('freelancer', 'employer')),
  work_quality DECIMAL(3,1) CHECK (work_quality >= 1 AND work_quality <= 5),
  communication DECIMAL(3,1) CHECK (communication >= 1 AND communication <= 5),
  professionalism DECIMAL(3,1) CHECK (professionalism >= 1 AND professionalism <= 5),
  would_work_again BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_reviews_contract_reviewer UNIQUE (contract_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews (reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_contract ON reviews (contract_id);
CREATE INDEX IF NOT EXISTS idx_reviews_contract_reviewer ON reviews (contract_id, reviewer_id);

-- =============================================================================
-- 12. DISPUTES
-- =============================================================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL,
  initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  resolution JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_contract ON disputes (contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_milestone ON disputes (milestone_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_initiator ON disputes (initiator_id);

-- =============================================================================
-- 13. DISPUTE EVIDENCE
-- =============================================================================
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evidence_type VARCHAR(20) NOT NULL CHECK (evidence_type IN ('document', 'screenshot', 'message', 'contract', 'other')),
  file_url TEXT,
  description TEXT NOT NULL,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence (dispute_id);

-- =============================================================================
-- 14. PAYMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id UUID,
  payer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'ETH',
  tx_hash VARCHAR(66),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  payment_type VARCHAR(30) NOT NULL CHECK (payment_type IN ('escrow_deposit', 'milestone_release', 'refund', 'dispute_resolution')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments (contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments (payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payee ON payments (payee_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

-- =============================================================================
-- 15. CONVERSATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_preview VARCHAR(255),
  unread_count_1 INTEGER NOT NULL DEFAULT 0,
  unread_count_2 INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON conversations (participant1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON conversations (participant2_id);

-- =============================================================================
-- 16. MESSAGES
-- =============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_read ON messages (receiver_id, is_read);

-- =============================================================================
-- 17. NOTIFICATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);

-- =============================================================================
-- 18. KYC VERIFICATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'approved', 'rejected', 'expired')),
  didit_session_id VARCHAR(255) NOT NULL,
  didit_session_token VARCHAR(255),
  didit_session_url TEXT,
  didit_workflow_id VARCHAR(255) NOT NULL,
  decision VARCHAR(20) CHECK (decision IN ('approved', 'declined', 'review')),
  decline_reasons JSONB,
  review_reasons JSONB,
  document_type VARCHAR(50),
  document_number VARCHAR(100),
  issuing_country VARCHAR(5),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  date_of_birth DATE,
  nationality VARCHAR(100),
  document_verified BOOLEAN,
  liveness_passed BOOLEAN,
  liveness_confidence_score VARCHAR(20),
  spoofing_detected BOOLEAN,
  face_matched BOOLEAN,
  face_similarity_score VARCHAR(20),
  ip_address VARCHAR(45),
  ip_country_code VARCHAR(5),
  ip_risk_score VARCHAR(20),
  is_vpn BOOLEAN,
  is_proxy BOOLEAN,
  threat_level VARCHAR(20),
  vendor_data TEXT,
  metadata JSONB,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_session ON kyc_verifications (didit_session_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_verifications (status);

-- =============================================================================
-- 19. EMAIL PREFERENCES
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_received BOOLEAN NOT NULL DEFAULT TRUE,
  proposal_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  milestone_updates BOOLEAN NOT NULL DEFAULT TRUE,
  payment_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  dispute_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_emails BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_digest BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_preferences_user ON email_preferences (user_id);

-- =============================================================================
-- 20. PENDING MFA SESSIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS pending_mfa_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_id VARCHAR(255) NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_mfa_user ON pending_mfa_sessions (user_id);

-- =============================================================================
-- 21. REFUND REQUESTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  is_partial BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  transaction_hash VARCHAR(66),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_contract ON refund_requests (contract_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests (status);

-- =============================================================================
-- 22. FAVORITES
-- =============================================================================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('project', 'freelancer')),
  target_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique ON favorites (user_id, target_type, target_id);

-- =============================================================================
-- 23. PORTFOLIO ITEMS
-- =============================================================================
CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_url TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  skills JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_freelancer ON portfolio_items (freelancer_id);

-- =============================================================================
-- 24. SAVED SEARCHES
-- =============================================================================
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('project', 'freelancer')),
  filters JSONB NOT NULL DEFAULT '{}',
  notify_on_new BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_notify ON saved_searches (notify_on_new) WHERE notify_on_new = TRUE;

-- =============================================================================
-- 25. USER CUSTOM SKILLS
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_custom_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  years_of_experience INTEGER NOT NULL DEFAULT 0,
  category_name VARCHAR(100),
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  suggested_for_global BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_skills_user ON user_custom_skills (user_id);

-- =============================================================================
-- 26. SKILL SUGGESTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS skill_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  skill_description TEXT NOT NULL DEFAULT '',
  category_name VARCHAR(100),
  suggested_by VARCHAR(255) NOT NULL,
  times_requested INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_suggestions_name ON skill_suggestions (skill_name);
CREATE INDEX IF NOT EXISTS idx_skill_suggestions_status ON skill_suggestions (status) WHERE status = 'pending';

-- =============================================================================
-- 27. RUSH UPGRADE REQUESTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS rush_upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_percentage DECIMAL(5,2) NOT NULL,
  counter_percentage DECIMAL(5,2),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'counter_offered', 'expired')),
  responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rush_requests_contract ON rush_upgrade_requests (contract_id);
CREATE INDEX IF NOT EXISTS idx_rush_requests_status ON rush_upgrade_requests (contract_id, status) WHERE status IN ('pending', 'counter_offered');

-- =============================================================================
-- 28. AUDIT LOG ENTRIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log_entries (action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log_entries (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log_entries (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_log_entries (status) WHERE status = 'failure';

-- =============================================================================
-- 29. BLOCKCHAIN TRANSACTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_transactions (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  from_address VARCHAR(42) NOT NULL,
  to_address VARCHAR(42) NOT NULL,
  amount VARCHAR(50) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  timestamp BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL DEFAULT 0,
  gas_used VARCHAR(50) NOT NULL DEFAULT '0',
  confirm_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_blockchain_tx_hash ON blockchain_transactions (hash);

-- =============================================================================
-- 30. BLOCKCHAIN AGREEMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_agreements (
  contract_id_hash VARCHAR(66) PRIMARY KEY,
  terms_hash VARCHAR(66) NOT NULL,
  employer_wallet VARCHAR(42) NOT NULL,
  freelancer_wallet VARCHAR(42) NOT NULL,
  total_amount VARCHAR(50) NOT NULL,
  milestone_count INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  employer_signed_at BIGINT,
  freelancer_signed_at BIGINT,
  created_at_ts BIGINT NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 31. BLOCKCHAIN ESCROWS
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_escrows (
  address VARCHAR(42) PRIMARY KEY,
  contract_id VARCHAR(255) NOT NULL,
  employer_address VARCHAR(42) NOT NULL,
  freelancer_address VARCHAR(42) NOT NULL,
  total_amount VARCHAR(50) NOT NULL,
  balance VARCHAR(50) NOT NULL DEFAULT '0',
  deployed_at BIGINT NOT NULL,
  deployment_tx_hash VARCHAR(66) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_escrows_contract ON blockchain_escrows (contract_id);

-- =============================================================================
-- 32. BLOCKCHAIN ESCROW MILESTONES
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_escrow_milestones (
  id VARCHAR(255) PRIMARY KEY,
  escrow_address VARCHAR(42) NOT NULL REFERENCES blockchain_escrows(address) ON DELETE CASCADE,
  amount VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_blockchain_escrow_ms_escrow ON blockchain_escrow_milestones (escrow_address);

-- =============================================================================
-- 33. BLOCKCHAIN MILESTONES
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_milestones (
  milestone_id_hash VARCHAR(66) PRIMARY KEY,
  contract_id_hash VARCHAR(66) NOT NULL,
  work_hash VARCHAR(66) NOT NULL,
  freelancer_wallet VARCHAR(42) NOT NULL,
  employer_wallet VARCHAR(42) NOT NULL,
  amount VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  submitted_at BIGINT,
  completed_at BIGINT,
  title VARCHAR(255) NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blockchain_ms_freelancer ON blockchain_milestones (freelancer_wallet);

-- =============================================================================
-- 34. BLOCKCHAIN DISPUTE RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_dispute_records (
  dispute_id_hash VARCHAR(66) PRIMARY KEY,
  contract_id_hash VARCHAR(66) NOT NULL,
  milestone_id_hash VARCHAR(66) NOT NULL,
  evidence_hash VARCHAR(66) NOT NULL,
  initiator_wallet VARCHAR(42) NOT NULL,
  freelancer_wallet VARCHAR(42) NOT NULL,
  employer_wallet VARCHAR(42) NOT NULL,
  arbiter_wallet VARCHAR(42) NOT NULL,
  amount VARCHAR(50) NOT NULL,
  outcome VARCHAR(20) NOT NULL,
  reasoning TEXT NOT NULL DEFAULT '',
  created_at_ts BIGINT NOT NULL,
  resolved_at BIGINT,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blockchain_dispute_freelancer ON blockchain_dispute_records (freelancer_wallet);
CREATE INDEX IF NOT EXISTS idx_blockchain_dispute_employer ON blockchain_dispute_records (employer_wallet);

-- =============================================================================
-- 35. BLOCKCHAIN RATINGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_ratings (
  id VARCHAR(255) PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating DECIMAL(3,1) NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  timestamp BIGINT NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blockchain_ratings_ratee ON blockchain_ratings (ratee_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_ratings_rater ON blockchain_ratings (rater_id);

-- =============================================================================
-- 36. TRANSACTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  milestone_id UUID,
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  transaction_hash VARCHAR(66),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions (from_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions (to_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contract ON transactions (contract_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions (created_at);

-- =============================================================================
-- Done! All 36 tables created with indexes and constraints.
-- =============================================================================

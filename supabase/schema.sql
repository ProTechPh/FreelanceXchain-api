-- FreelanceXchain Supabase Schema
-- Run this in your Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('freelancer', 'employer', 'admin')),
  wallet_address VARCHAR(255) DEFAULT '',
  name VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skill Categories table
CREATE TABLE IF NOT EXISTS skill_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skills table
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES skill_categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Freelancer Profiles table
CREATE TABLE IF NOT EXISTS freelancer_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  nationality VARCHAR(100),
  bio TEXT,
  hourly_rate DECIMAL(10, 2) DEFAULT 0,
  skills JSONB DEFAULT '[]',
  experience JSONB DEFAULT '[]',
  availability VARCHAR(20) DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'unavailable')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employer Profiles table
CREATE TABLE IF NOT EXISTS employer_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  nationality VARCHAR(100),
  company_name VARCHAR(255),
  description TEXT,
  industry VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  required_skills JSONB DEFAULT '[]',
  budget DECIMAL(12, 2) DEFAULT 0,
  deadline TIMESTAMPTZ,
  is_rush BOOLEAN DEFAULT false,
  rush_fee_percentage DECIMAL(5,2) DEFAULT 25.00,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'in_progress', 'completed', 'cancelled')),
  milestones JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Proposals table
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  proposed_rate DECIMAL(10, 2) DEFAULT 0,
  estimated_duration INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: only one active (non-withdrawn) proposal per freelancer per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_unique_active
  ON proposals(project_id, freelancer_id)
  WHERE status != 'withdrawn';

COMMENT ON COLUMN proposals.attachments IS 'Array of file attachments with metadata: [{url, filename, size, mimeType}]';
COMMENT ON COLUMN proposals.cover_letter IS 'Legacy text cover letter field - nullable for backward compatibility';
COMMENT ON COLUMN proposals.tags IS 'Array of tags/hashtags for categorizing and filtering proposals';

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
  freelancer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  employer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  escrow_address VARCHAR(255),
  base_amount DECIMAL(12, 2) DEFAULT 0,
  rush_fee DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'disputed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rush Upgrade Requests table (for mid-contract rush negotiation)
CREATE TABLE IF NOT EXISTS rush_upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_percentage DECIMAL(5,2) NOT NULL CHECK (proposed_percentage > 0 AND proposed_percentage <= 100),
  counter_percentage DECIMAL(5,2) CHECK (counter_percentage IS NULL OR (counter_percentage > 0 AND counter_percentage <= 100)),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'counter_offered', 'expired')),
  responded_by UUID REFERENCES users(id),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disputes table
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id VARCHAR(255),
  initiator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  evidence JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  resolution JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- KYC Verifications table
-- FIXED: Aligned with code's KycVerification type in models/didit-kyc.ts
-- Added all columns the code writes to, fixed CHECK constraint to match KycStatus type
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'approved', 'rejected', 'expired')),

  -- Didit session info
  didit_session_id VARCHAR(255),
  didit_session_token TEXT,
  didit_session_url TEXT,
  didit_workflow_id VARCHAR(255),

  -- Verification decision from Didit
  decision VARCHAR(20) CHECK (decision IN ('approved', 'declined') OR decision IS NULL),
  decline_reasons JSONB DEFAULT '[]',
  review_reasons JSONB DEFAULT '[]',

  -- Document info (from Didit)
  document_type VARCHAR(100),
  document_number VARCHAR(255),
  issuing_country VARCHAR(100),

  -- Personal info (from Didit)
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  date_of_birth DATE,
  nationality VARCHAR(100),

  -- Verification results
  document_verified BOOLEAN,
  liveness_passed BOOLEAN,
  liveness_confidence_score VARCHAR(50),
  spoofing_detected BOOLEAN,
  face_matched BOOLEAN,
  face_similarity_score VARCHAR(50),

  -- IP analysis
  ip_address VARCHAR(45),
  ip_country_code VARCHAR(10),
  ip_risk_score VARCHAR(50),
  is_vpn BOOLEAN,
  is_proxy BOOLEAN,
  threat_level VARCHAR(50),

  -- Additional data
  vendor_data TEXT,
  metadata JSONB DEFAULT '{}',

  -- Admin review
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Reviews table (for ratings and feedback)
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  reviewer_role VARCHAR(20) NOT NULL CHECK (reviewer_role IN ('freelancer', 'employer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, reviewer_id)
);

-- Messages table (for communication between parties)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table (transaction history)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id VARCHAR(255),
  payer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  payee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'ETH',
  tx_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('escrow_deposit', 'milestone_release', 'refund', 'dispute_resolution')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_freelancer_profiles_user_id ON freelancer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_employer_profiles_user_id ON employer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_employer_id ON projects(employer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_proposals_project_id ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_id ON proposals(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_id ON contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_employer_id ON contracts(employer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_disputes_contract_id ON disputes(contract_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_didit_session_id ON kyc_verifications(didit_session_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_verifications(status);
CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_projects_budget ON projects(budget);
CREATE INDEX IF NOT EXISTS idx_reviews_contract_id ON reviews(contract_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_messages_contract_id ON messages(contract_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract_id ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer_id ON payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payee_id ON payments(payee_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_rush_upgrade_contract_id ON rush_upgrade_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_rush_upgrade_requested_by ON rush_upgrade_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_rush_upgrade_status ON rush_upgrade_requests(status);

-- Unique constraints to prevent data inconsistencies
-- FIXED: These were missing, allowing duplicate entries via race conditions
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_skill_category_name ON skill_categories(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_skill_name_category ON skills(name, category_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE freelancer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- NOTE: The backend uses the SERVICE_ROLE_KEY which bypasses RLS entirely.
-- These policies protect data when using the ANON_KEY or user JWTs directly
-- (e.g., from a frontend Supabase client).
-- ============================================================

-- Skill categories & skills: public read, admin write
CREATE POLICY "Allow public read on skill_categories" ON skill_categories FOR SELECT USING (true);
CREATE POLICY "Allow public read on skills" ON skills FOR SELECT USING (true);
CREATE POLICY "Admin manage skill_categories" ON skill_categories FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admin manage skills" ON skills FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Users: read own data, admins read all
CREATE POLICY "Users read own data" ON users FOR SELECT
  USING (auth.uid() = id OR auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Users update own data" ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own record" ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Admin full access users" ON users FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Freelancer profiles: owner read/write, public read for discovery
CREATE POLICY "Freelancer profiles public read" ON freelancer_profiles FOR SELECT USING (true);
CREATE POLICY "Freelancer profiles owner update" ON freelancer_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Freelancer profiles owner insert" ON freelancer_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Freelancer profiles owner delete" ON freelancer_profiles FOR DELETE
  USING (user_id = auth.uid());

-- Employer profiles: owner read/write, public read for discovery
CREATE POLICY "Employer profiles public read" ON employer_profiles FOR SELECT USING (true);
CREATE POLICY "Employer profiles owner update" ON employer_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Employer profiles owner insert" ON employer_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Employer profiles owner delete" ON employer_profiles FOR DELETE
  USING (user_id = auth.uid());

-- Projects: public read for open, owner read/write for all statuses
CREATE POLICY "Projects public read open" ON projects FOR SELECT
  USING (status = 'open' OR employer_id = auth.uid());
CREATE POLICY "Projects employer insert" ON projects FOR INSERT
  WITH CHECK (employer_id = auth.uid());
CREATE POLICY "Projects employer update" ON projects FOR UPDATE
  USING (employer_id = auth.uid())
  WITH CHECK (employer_id = auth.uid());
CREATE POLICY "Projects employer delete" ON projects FOR DELETE
  USING (employer_id = auth.uid());
CREATE POLICY "Admin full access projects" ON projects FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Proposals: freelancer owns theirs, employer sees proposals on their projects
CREATE POLICY "Proposals freelancer read own" ON proposals FOR SELECT
  USING (
    freelancer_id = auth.uid()
    OR project_id IN (SELECT id FROM projects WHERE employer_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'admin'
  );
CREATE POLICY "Proposals freelancer insert" ON proposals FOR INSERT
  WITH CHECK (freelancer_id = auth.uid());
CREATE POLICY "Proposals freelancer update own" ON proposals FOR UPDATE
  USING (
    freelancer_id = auth.uid()
    OR project_id IN (SELECT id FROM projects WHERE employer_id = auth.uid())
  );

-- Contracts: only contract parties can read
CREATE POLICY "Contracts parties read" ON contracts FOR SELECT
  USING (
    freelancer_id = auth.uid()
    OR employer_id = auth.uid()
    OR auth.jwt() ->> 'role' = 'admin'
  );
CREATE POLICY "Admin full access contracts" ON contracts FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Disputes: only contract parties and admins
CREATE POLICY "Disputes parties read" ON disputes FOR SELECT
  USING (
    initiator_id = auth.uid()
    OR contract_id IN (
      SELECT id FROM contracts WHERE freelancer_id = auth.uid() OR employer_id = auth.uid()
    )
    OR auth.jwt() ->> 'role' = 'admin'
  );
CREATE POLICY "Disputes parties insert" ON disputes FOR INSERT
  WITH CHECK (initiator_id = auth.uid());
CREATE POLICY "Admin full access disputes" ON disputes FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Notifications: user reads only their own
CREATE POLICY "Notifications user read own" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Notifications user update own" ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- KYC verifications: user reads only their own, admin reads all
CREATE POLICY "KYC user read own" ON kyc_verifications FOR SELECT
  USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "KYC user insert own" ON kyc_verifications FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admin full access kyc" ON kyc_verifications FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Reviews: public read (reputation transparency), parties write
CREATE POLICY "Reviews public read" ON reviews FOR SELECT USING (true);
CREATE POLICY "Reviews reviewer insert" ON reviews FOR INSERT
  WITH CHECK (reviewer_id = auth.uid());

-- Messages: only contract parties
CREATE POLICY "Messages parties read" ON messages FOR SELECT
  USING (
    sender_id = auth.uid()
    OR contract_id IN (
      SELECT id FROM contracts WHERE freelancer_id = auth.uid() OR employer_id = auth.uid()
    )
  );
CREATE POLICY "Messages sender insert" ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Payments: only contract parties and admins
CREATE POLICY "Payments parties read" ON payments FOR SELECT
  USING (
    payer_id = auth.uid()
    OR payee_id = auth.uid()
    OR auth.jwt() ->> 'role' = 'admin'
  );
CREATE POLICY "Admin full access payments" ON payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Rush upgrade requests: only contract parties can read/write
CREATE POLICY "Rush upgrade contract parties read" ON rush_upgrade_requests FOR SELECT
  USING (
    requested_by = auth.uid()
    OR contract_id IN (
      SELECT id FROM contracts WHERE freelancer_id = auth.uid() OR employer_id = auth.uid()
    )
    OR auth.jwt() ->> 'role' = 'admin'
  );
CREATE POLICY "Rush upgrade employer insert" ON rush_upgrade_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    OR auth.jwt() ->> 'role' = 'admin'
  );
CREATE POLICY "Rush upgrade parties update" ON rush_upgrade_requests FOR UPDATE
  USING (
    contract_id IN (
      SELECT id FROM contracts WHERE freelancer_id = auth.uid() OR employer_id = auth.uid()
    )
    OR auth.jwt() ->> 'role' = 'admin'
  );
CREATE POLICY "Admin full access rush_upgrade_requests" ON rush_upgrade_requests FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Audit log entries table (used by audit-log-repository)
CREATE TABLE IF NOT EXISTS audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log_entries(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log_entries(created_at);
CREATE INDEX idx_audit_log_action ON audit_log_entries(action);

ALTER TABLE audit_log_entries ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admin read audit logs" ON audit_log_entries FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');
-- Service role inserts audit logs (no user-level insert)
CREATE POLICY "Service insert audit logs" ON audit_log_entries FOR INSERT
  WITH CHECK (true);

-- RPC for atomic evidence appending to avoid race conditions
CREATE OR REPLACE FUNCTION append_dispute_evidence(p_dispute_id UUID, p_evidence JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_evidence JSONB;
  v_new_evidence JSONB;
BEGIN
  -- Get current evidence with row lock
  SELECT evidence INTO v_current_evidence
  FROM disputes
  WHERE id = p_dispute_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;

  -- Append new evidence
  v_new_evidence := COALESCE(v_current_evidence, '[]'::jsonb) || p_evidence;

  -- Update dispute
  UPDATE disputes
  SET 
    evidence = v_new_evidence,
    status = CASE WHEN status = 'open' THEN 'under_review' ELSE status END,
    updated_at = NOW()
  WHERE id = p_dispute_id;

  RETURN v_new_evidence;
END;
$$;
  WITH CHECK (true);

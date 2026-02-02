-- Migration: Didit KYC Verifications Table (Simplified)
-- Description: Simplified KYC table - Didit handles all verification data
-- Date: 2026-01-15

-- Drop old KYC table if exists (backup data first if needed!)
DROP TABLE IF EXISTS kyc_verifications CASCADE;

-- Create simplified KYC verifications table
-- Note: Didit handles all verification data (documents, liveness, face match, IP analysis)
-- We only store session info and final decision
CREATE TABLE kyc_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'approved', 'rejected', 'expired')),
    
    -- Didit session information
    didit_session_id VARCHAR(255) NOT NULL UNIQUE,
    didit_session_token VARCHAR(255) NOT NULL,
    didit_session_url TEXT NOT NULL,
    didit_workflow_id VARCHAR(255) NOT NULL,
    
    -- Verification decision from Didit
    decision VARCHAR(20) CHECK (decision IN ('approved', 'declined', 'review')),
    
    -- Admin review
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for common queries
CREATE INDEX idx_kyc_user_id ON kyc_verifications(user_id);
CREATE INDEX idx_kyc_status ON kyc_verifications(status);
CREATE INDEX idx_kyc_didit_session_id ON kyc_verifications(didit_session_id);
CREATE INDEX idx_kyc_decision ON kyc_verifications(decision);
CREATE INDEX idx_kyc_pending_review ON kyc_verifications(status, reviewed_by) WHERE status = 'completed' AND reviewed_by IS NULL;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_kyc_updated_at()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kyc_updated_at
    BEFORE UPDATE ON kyc_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_kyc_updated_at();

-- Add RLS policies
ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own KYC verifications
CREATE POLICY kyc_user_select ON kyc_verifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own KYC verifications
CREATE POLICY kyc_user_insert ON kyc_verifications
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending/in_progress verifications
CREATE POLICY kyc_user_update ON kyc_verifications
    FOR UPDATE
    USING (auth.uid() = user_id AND status IN ('pending', 'in_progress'));

-- Admins can view all verifications
CREATE POLICY kyc_admin_select ON kyc_verifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admins can update all verifications
CREATE POLICY kyc_admin_update ON kyc_verifications
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comment
COMMENT ON TABLE kyc_verifications IS 'KYC verifications using Didit API - stores only session info and decision (Didit handles all verification data)';

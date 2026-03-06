-- Migration 005: Persist in-memory blockchain stores and MFA sessions to database
-- This ensures data survives server restarts

-- 1. Blockchain Transactions (foundation layer)
CREATE TABLE IF NOT EXISTS blockchain_transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('escrow_deploy', 'escrow_deposit', 'milestone_release', 'refund', 'agreement_create', 'agreement_sign', 'dispute_create', 'dispute_resolve', 'rating_submit', 'milestone_submit', 'milestone_approve', 'kyc_submit', 'kyc_approve', 'kyc_reject')),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount TEXT NOT NULL DEFAULT '0', -- bigint stored as string
  data JSONB NOT NULL DEFAULT '{}',
  timestamp BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  hash TEXT,
  block_number BIGINT,
  gas_used TEXT, -- bigint stored as string
  confirm_at BIGINT, -- for pending transaction scheduling
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_transactions_hash ON blockchain_transactions(hash);
CREATE INDEX IF NOT EXISTS idx_blockchain_transactions_status ON blockchain_transactions(status);

-- 2. Blockchain Escrows
CREATE TABLE IF NOT EXISTS blockchain_escrows (
  address TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  employer_address TEXT NOT NULL,
  freelancer_address TEXT NOT NULL,
  total_amount TEXT NOT NULL, -- bigint stored as string
  balance TEXT NOT NULL DEFAULT '0', -- bigint stored as string
  deployed_at BIGINT NOT NULL,
  deployment_tx_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_escrows_contract ON blockchain_escrows(contract_id);

-- 3. Escrow Milestones (child of blockchain_escrows)
CREATE TABLE IF NOT EXISTS blockchain_escrow_milestones (
  id TEXT NOT NULL,
  escrow_address TEXT NOT NULL REFERENCES blockchain_escrows(address) ON DELETE CASCADE,
  amount TEXT NOT NULL, -- bigint stored as string
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'released', 'refunded')),
  PRIMARY KEY (escrow_address, id)
);

-- 4. Blockchain Agreements
CREATE TABLE IF NOT EXISTS blockchain_agreements (
  contract_id_hash TEXT PRIMARY KEY,
  terms_hash TEXT NOT NULL,
  employer_wallet TEXT NOT NULL,
  freelancer_wallet TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  milestone_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'completed', 'disputed', 'cancelled')),
  employer_signed_at BIGINT,
  freelancer_signed_at BIGINT,
  created_at_ts BIGINT NOT NULL, -- blockchain timestamp
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_agreements_employer ON blockchain_agreements(employer_wallet);
CREATE INDEX IF NOT EXISTS idx_blockchain_agreements_freelancer ON blockchain_agreements(freelancer_wallet);

-- 5. Blockchain Dispute Records
CREATE TABLE IF NOT EXISTS blockchain_dispute_records (
  dispute_id_hash TEXT PRIMARY KEY,
  contract_id_hash TEXT NOT NULL,
  milestone_id_hash TEXT NOT NULL,
  evidence_hash TEXT,
  initiator_wallet TEXT NOT NULL,
  freelancer_wallet TEXT NOT NULL,
  employer_wallet TEXT NOT NULL,
  arbiter_wallet TEXT,
  amount NUMERIC NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'freelancer_favor', 'employer_favor', 'split', 'cancelled')),
  reasoning TEXT,
  created_at_ts BIGINT NOT NULL, -- blockchain timestamp
  resolved_at BIGINT,
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_disputes_initiator ON blockchain_dispute_records(initiator_wallet);
CREATE INDEX IF NOT EXISTS idx_blockchain_disputes_freelancer ON blockchain_dispute_records(freelancer_wallet);
CREATE INDEX IF NOT EXISTS idx_blockchain_disputes_employer ON blockchain_dispute_records(employer_wallet);

-- 6. Blockchain Ratings
CREATE TABLE IF NOT EXISTS blockchain_ratings (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  rater_id TEXT NOT NULL,
  ratee_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  timestamp BIGINT NOT NULL,
  transaction_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_ratings_ratee ON blockchain_ratings(ratee_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_ratings_rater ON blockchain_ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_ratings_contract ON blockchain_ratings(contract_id);

-- 7. Blockchain Milestone Records
CREATE TABLE IF NOT EXISTS blockchain_milestones (
  milestone_id_hash TEXT PRIMARY KEY,
  contract_id_hash TEXT NOT NULL,
  work_hash TEXT NOT NULL,
  freelancer_wallet TEXT NOT NULL,
  employer_wallet TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'disputed')),
  submitted_at BIGINT NOT NULL,
  completed_at BIGINT,
  title TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_milestones_freelancer ON blockchain_milestones(freelancer_wallet);

-- 8. Blockchain KYC Verifications
CREATE TABLE IF NOT EXISTS blockchain_kyc_verifications (
  wallet_address TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_id_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'pending', 'approved', 'rejected', 'expired')),
  tier TEXT NOT NULL DEFAULT 'none' CHECK (tier IN ('none', 'basic', 'standard', 'enhanced')),
  data_hash TEXT NOT NULL,
  verified_at BIGINT,
  expires_at BIGINT,
  verified_by TEXT,
  rejection_reason TEXT,
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_kyc_user_id_hash ON blockchain_kyc_verifications(user_id_hash);

-- 9. Pending MFA Sessions (short-lived, with automatic expiry)
CREATE TABLE IF NOT EXISTS pending_mfa_sessions (
  session_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  user_id TEXT NOT NULL,
  factor_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_mfa_sessions_expires ON pending_mfa_sessions(expires_at);

-- RLS policies: blockchain tables are server-side only (service role)
-- No direct client access needed

ALTER TABLE blockchain_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_escrow_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_dispute_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_mfa_sessions ENABLE ROW LEVEL SECURITY;

-- Service role policies (full access for server-side operations)
CREATE POLICY "Service role full access" ON blockchain_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blockchain_escrows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blockchain_escrow_milestones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blockchain_agreements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blockchain_dispute_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blockchain_ratings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blockchain_milestones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON blockchain_kyc_verifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON pending_mfa_sessions FOR ALL USING (true) WITH CHECK (true);

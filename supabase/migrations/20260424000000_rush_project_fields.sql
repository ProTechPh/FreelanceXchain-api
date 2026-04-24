-- Add rush project fields and rush upgrade request table
-- Supports: (A) rush at project creation, (B) rush upgrade mid-contract with negotiable percentage

-- 1. Add rush fields to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_rush BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rush_fee_percentage DECIMAL(5,2) DEFAULT 25.00;

COMMENT ON COLUMN projects.is_rush IS 'Whether this project is marked as rush by the employer';
COMMENT ON COLUMN projects.rush_fee_percentage IS 'Rush fee percentage applied on top of freelancer proposed rate (default 25%)';

-- 2. Add rush fee fields to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS base_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rush_fee DECIMAL(12,2) DEFAULT 0;

COMMENT ON COLUMN contracts.base_amount IS 'Base contract amount (freelancer proposed rate) before rush fee';
COMMENT ON COLUMN contracts.rush_fee IS 'Rush fee amount added on top of base amount for rush projects';

-- 3. Create rush_upgrade_requests table for mid-contract rush negotiation
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

CREATE INDEX IF NOT EXISTS idx_rush_upgrade_contract_id ON rush_upgrade_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_rush_upgrade_requested_by ON rush_upgrade_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_rush_upgrade_status ON rush_upgrade_requests(status);

ALTER TABLE rush_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Only contract parties can view rush upgrade requests
CREATE POLICY "Rush upgrade contract parties read" ON rush_upgrade_requests FOR SELECT
  USING (
    requested_by = auth.uid()
    OR contract_id IN (
      SELECT id FROM contracts WHERE freelancer_id = auth.uid() OR employer_id = auth.uid()
    )
    OR auth.jwt() ->> 'role' = 'admin'
  );

-- Only employers can create rush upgrade requests
CREATE POLICY "Rush upgrade employer insert" ON rush_upgrade_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    OR auth.jwt() ->> 'role' = 'admin'
  );

-- Both parties can update (freelancer responds, employer accepts counter)
CREATE POLICY "Rush upgrade parties update" ON rush_upgrade_requests FOR UPDATE
  USING (
    contract_id IN (
      SELECT id FROM contracts WHERE freelancer_id = auth.uid() OR employer_id = auth.uid()
    )
    OR auth.jwt() ->> 'role' = 'admin'
  );

-- Admin full access
CREATE POLICY "Admin full access rush_upgrade_requests" ON rush_upgrade_requests FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- 4. Update accept_proposal_atomic RPC to handle rush fee
CREATE OR REPLACE FUNCTION accept_proposal_atomic(
  p_proposal_id UUID,
  p_employer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id UUID;
  v_current_status VARCHAR;
  v_project_employer UUID;
  v_accepted_count INT;
  v_proposal_rate DECIMAL;
  v_project_budget DECIMAL;
  v_freelancer_id UUID;
  v_contract_id UUID;
  v_is_rush BOOLEAN;
  v_rush_fee_percentage DECIMAL;
  v_base_amount DECIMAL;
  v_rush_fee DECIMAL;
  v_total_amount DECIMAL;
  v_result JSONB;
BEGIN
  -- 1. Lock the project row to prevent concurrent modifications
  SELECT id, employer_id, budget, is_rush, rush_fee_percentage
  INTO v_project_id, v_project_employer, v_project_budget, v_is_rush, v_rush_fee_percentage
  FROM projects
  WHERE id = (SELECT project_id FROM proposals WHERE id = p_proposal_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found for this proposal';
  END IF;

  -- 2. Verify employer owns the project
  IF v_project_employer != p_employer_id THEN
    RAISE EXCEPTION 'You are not authorized to accept proposals for this project';
  END IF;

  -- 3. Check if proposal exists and is pending
  SELECT status, proposed_rate, freelancer_id INTO v_current_status, v_proposal_rate, v_freelancer_id
  FROM proposals
  WHERE id = p_proposal_id;

  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'Cannot accept proposal with status %', v_current_status;
  END IF;

  -- 4. Check if project already has an accepted proposal
  SELECT COUNT(*) INTO v_accepted_count
  FROM proposals
  WHERE project_id = v_project_id AND status = 'accepted';

  IF v_accepted_count > 0 THEN
    RAISE EXCEPTION 'Another proposal has already been accepted for this project';
  END IF;

  -- 5. Calculate amounts (with rush fee if applicable)
  v_base_amount := COALESCE(v_proposal_rate, v_project_budget);

  IF v_is_rush AND v_rush_fee_percentage IS NOT NULL AND v_rush_fee_percentage > 0 THEN
    v_rush_fee := ROUND(v_base_amount * v_rush_fee_percentage / 100, 2);
    v_total_amount := v_base_amount + v_rush_fee;
  ELSE
    v_rush_fee := 0;
    v_total_amount := v_base_amount;
  END IF;

  -- 6. Update the target proposal
  UPDATE proposals
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_proposal_id;

  -- 7. Reject all other pending proposals for this project
  UPDATE proposals
  SET status = 'rejected', updated_at = NOW()
  WHERE project_id = v_project_id 
    AND id != p_proposal_id 
    AND status = 'pending';

  -- 8. Create the contract inside the transaction
  v_contract_id := uuid_generate_v4();
  
  INSERT INTO contracts (
    id, project_id, proposal_id, freelancer_id, employer_id, 
    base_amount, rush_fee, total_amount, status, created_at, updated_at
  ) VALUES (
    v_contract_id, v_project_id, p_proposal_id, v_freelancer_id, p_employer_id,
    v_base_amount, v_rush_fee, v_total_amount, 'pending', NOW(), NOW()
  );

  -- Return success with the new contract ID
  v_result := jsonb_build_object(
    'success', true,
    'contract_id', v_contract_id,
    'freelancer_id', v_freelancer_id,
    'project_id', v_project_id,
    'base_amount', v_base_amount,
    'rush_fee', v_rush_fee,
    'total_amount', v_total_amount,
    'is_rush', v_is_rush
  );

  RETURN v_result;
END;
$$;

-- 5. RPC for applying rush upgrade to an active contract (called after both parties agree)
CREATE OR REPLACE FUNCTION apply_rush_upgrade_atomic(
  p_contract_id UUID,
  p_rush_fee_percentage DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_amount DECIMAL;
  v_rush_fee DECIMAL;
  v_new_total DECIMAL;
  v_project_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Lock the contract row
  SELECT base_amount, project_id INTO v_base_amount, v_project_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- 2. Calculate new amounts
  v_rush_fee := ROUND(v_base_amount * p_rush_fee_percentage / 100, 2);
  v_new_total := v_base_amount + v_rush_fee;

  -- 3. Update contract
  UPDATE contracts
  SET rush_fee = v_rush_fee,
      total_amount = v_new_total,
      updated_at = NOW()
  WHERE id = p_contract_id;

  -- 4. Update project to mark as rush
  UPDATE projects
  SET is_rush = true,
      rush_fee_percentage = p_rush_fee_percentage,
      updated_at = NOW()
  WHERE id = v_project_id;

  v_result := jsonb_build_object(
    'success', true,
    'contract_id', p_contract_id,
    'base_amount', v_base_amount,
    'rush_fee', v_rush_fee,
    'total_amount', v_new_total,
    'rush_fee_percentage', p_rush_fee_percentage
  );

  RETURN v_result;
END;
$$;

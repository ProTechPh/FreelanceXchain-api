-- Add freelancer_limit to projects for agency/multi-freelancer support
-- Employer can customize how many freelancers can be accepted per project (default 1)

-- 1. Add freelancer_limit column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS freelancer_limit INTEGER DEFAULT 1 CHECK (freelancer_limit >= 1);

COMMENT ON COLUMN projects.freelancer_limit IS 'Maximum number of freelancers that can be accepted for this project. Default 1 (single freelancer).';

-- 2. Update accept_proposal_atomic RPC to respect freelancer_limit
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
  v_freelancer_limit INT;
  v_proposal_rate DECIMAL;
  v_project_budget DECIMAL;
  v_freelancer_id UUID;
  v_contract_id UUID;
  v_is_rush BOOLEAN;
  v_rush_fee_percentage DECIMAL;
  v_base_amount DECIMAL;
  v_rush_fee DECIMAL;
  v_total_amount DECIMAL;
  v_limit_reached BOOLEAN;
  v_result JSONB;
BEGIN
  -- 1. Lock the project row to prevent concurrent modifications
  SELECT id, employer_id, budget, is_rush, rush_fee_percentage, freelancer_limit
  INTO v_project_id, v_project_employer, v_project_budget, v_is_rush, v_rush_fee_percentage, v_freelancer_limit
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

  -- 4. Check how many proposals have already been accepted for this project
  SELECT COUNT(*) INTO v_accepted_count
  FROM proposals
  WHERE project_id = v_project_id AND status = 'accepted';

  -- 5. Check if freelancer limit has been reached
  IF v_accepted_count >= v_freelancer_limit THEN
    RAISE EXCEPTION 'Freelancer limit (%) has been reached for this project', v_freelancer_limit;
  END IF;

  -- 6. Calculate amounts (with rush fee if applicable)
  v_base_amount := COALESCE(v_proposal_rate, v_project_budget);

  IF v_is_rush AND v_rush_fee_percentage IS NOT NULL AND v_rush_fee_percentage > 0 THEN
    v_rush_fee := ROUND(v_base_amount * v_rush_fee_percentage / 100, 2);
    v_total_amount := v_base_amount + v_rush_fee;
  ELSE
    v_rush_fee := 0;
    v_total_amount := v_base_amount;
  END IF;

  -- 7. Update the target proposal
  UPDATE proposals
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_proposal_id;

  -- 8. Determine if freelancer limit is now reached after this acceptance
  v_limit_reached := (v_accepted_count + 1) >= v_freelancer_limit;

  -- 9. Only reject other pending proposals if the freelancer limit has been reached
  IF v_limit_reached THEN
    UPDATE proposals
    SET status = 'rejected', updated_at = NOW()
    WHERE project_id = v_project_id 
      AND id != p_proposal_id 
      AND status = 'pending';
  END IF;

  -- 10. Create the contract inside the transaction
  v_contract_id := uuid_generate_v4();
  
  INSERT INTO contracts (
    id, project_id, proposal_id, freelancer_id, employer_id, 
    base_amount, rush_fee, total_amount, status, created_at, updated_at
  ) VALUES (
    v_contract_id, v_project_id, p_proposal_id, v_freelancer_id, p_employer_id,
    v_base_amount, v_rush_fee, v_total_amount, 'pending', NOW(), NOW()
  );

  -- Return success with the new contract ID and limit info
  v_result := jsonb_build_object(
    'success', true,
    'contract_id', v_contract_id,
    'freelancer_id', v_freelancer_id,
    'project_id', v_project_id,
    'base_amount', v_base_amount,
    'rush_fee', v_rush_fee,
    'total_amount', v_total_amount,
    'is_rush', v_is_rush,
    'freelancer_limit', v_freelancer_limit,
    'accepted_count', v_accepted_count + 1,
    'limit_reached', v_limit_reached
  );

  RETURN v_result;
END;
$$;

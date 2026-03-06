-- RPC to safely cancel a pending contract
-- Only employers or the assigned freelancer can cancel a pending contract
-- Updates the contract to 'cancelled'
-- Reverts the project status back to 'open' to accept new proposals
-- Reverts the accepted proposal back to 'withdrawn' so it's not permanently stuck

CREATE OR REPLACE FUNCTION cancel_pending_contract(
  p_contract_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract_status VARCHAR;
  v_contract_employer UUID;
  v_contract_freelancer UUID;
  v_project_id UUID;
  v_proposal_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Lock the contract row
  SELECT status, employer_id, freelancer_id, project_id, proposal_id
  INTO v_contract_status, v_contract_employer, v_contract_freelancer, v_project_id, v_proposal_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- 2. Verify authorization
  IF p_user_id != v_contract_employer AND p_user_id != v_contract_freelancer THEN
    RAISE EXCEPTION 'Only the employer or the freelancer can cancel this contract';
  END IF;

  -- 3. Verify status (only pending contracts can be cancelled this way)
  IF v_contract_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending contracts (unfunded escrows) can be cancelled. Current status: %', v_contract_status;
  END IF;

  -- 4. Lock and update the project (reopen it)
  UPDATE projects
  SET status = 'open', updated_at = NOW()
  WHERE id = v_project_id;

  -- 5. Lock and update the proposal (withdraw it so the freelancer can potentially bid again)
  UPDATE proposals
  SET status = 'withdrawn', updated_at = NOW()
  WHERE id = v_proposal_id;

  -- 6. Cancel the contract
  UPDATE contracts
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_contract_id;

  v_result := jsonb_build_object(
    'success', true,
    'contract_id', p_contract_id,
    'project_id', v_project_id,
    'proposal_id', v_proposal_id
  );

  RETURN v_result;
END;
$$;

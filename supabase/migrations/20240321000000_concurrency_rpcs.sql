-- Duplicate the file to follow the correct naming convention
-- The previous file was named 009_concurrency_rpcs.sql which might break sequential order depending on the CLI version

-- (Content is identical to previous command)
-- RPC to safely accept a proposal and prevent race conditions
-- Checks that no other proposal has been accepted for the project
-- Updates the proposal status to 'accepted'
-- Rejects all other proposals for the same project
-- Returns the accepted proposal ID or throws an error

CREATE OR REPLACE FUNCTION accept_proposal_atomic(
  p_proposal_id UUID,
  p_employer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to bypass RLS for the atomic check
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
  v_result JSONB;
BEGIN
  -- 1. Lock the project row to prevent concurrent modifications
  SELECT id, employer_id, budget INTO v_project_id, v_project_employer, v_project_budget
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

  -- 5. Update the target proposal
  UPDATE proposals
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_proposal_id;

  -- 6. Reject all other pending proposals for this project
  UPDATE proposals
  SET status = 'rejected', updated_at = NOW()
  WHERE project_id = v_project_id 
    AND id != p_proposal_id 
    AND status = 'pending';

  -- 7. Create the contract inside the transaction
  v_contract_id := uuid_generate_v4();
  
  INSERT INTO contracts (
    id, project_id, proposal_id, freelancer_id, employer_id, 
    total_amount, status, created_at, updated_at
  ) VALUES (
    v_contract_id, v_project_id, p_proposal_id, v_freelancer_id, p_employer_id,
    COALESCE(v_proposal_rate, v_project_budget), 'pending', NOW(), NOW()
  );

  -- Return success with the new contract ID
  v_result := jsonb_build_object(
    'success', true,
    'contract_id', v_contract_id,
    'freelancer_id', v_freelancer_id,
    'project_id', v_project_id
  );

  RETURN v_result;
END;
$$;


-- RPC to safely approve a milestone and prevent race conditions (double approvals)
-- Checks the milestone status atomically and transitions it to 'approved'

CREATE OR REPLACE FUNCTION approve_milestone_atomic(
  p_contract_id UUID,
  p_milestone_id VARCHAR,
  p_employer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract_employer UUID;
  v_contract_status VARCHAR;
  v_project_id UUID;
  v_milestones JSONB;
  v_milestone JSONB;
  v_milestone_idx INT;
  v_milestone_status VARCHAR;
  v_milestone_amount DECIMAL;
  v_all_approved BOOLEAN := true;
  v_updated_milestones JSONB;
  v_result JSONB;
  i INT;
BEGIN
  -- 1. Lock the contract
  SELECT employer_id, status, project_id INTO v_contract_employer, v_contract_status, v_project_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- 2. Verify employer
  IF v_contract_employer != p_employer_id THEN
    RAISE EXCEPTION 'Only the contract employer can approve milestones';
  END IF;

  -- 3. Verify contract status
  IF v_contract_status != 'active' THEN
    RAISE EXCEPTION 'Cannot approve milestone on a % contract', v_contract_status;
  END IF;

  -- 4. Lock the project to safely update its milestones array
  SELECT milestones INTO v_milestones
  FROM projects
  WHERE id = v_project_id
  FOR UPDATE;

  IF v_milestones IS NULL OR jsonb_array_length(v_milestones) = 0 THEN
    RAISE EXCEPTION 'Project has no milestones';
  END IF;

  -- 5. Find the milestone and check its status
  v_milestone_idx := -1;
  FOR i IN 0 .. jsonb_array_length(v_milestones) - 1 LOOP
    v_milestone := v_milestones->i;
    IF v_milestone->>'id' = p_milestone_id THEN
      v_milestone_idx := i;
      v_milestone_status := v_milestone->>'status';
      v_milestone_amount := (v_milestone->>'amount')::NUMERIC;
      EXIT;
    END IF;
  END LOOP;

  IF v_milestone_idx = -1 THEN
    RAISE EXCEPTION 'Milestone not found';
  END IF;

  IF v_milestone_status = 'approved' THEN
    RAISE EXCEPTION 'Milestone already approved';
  ELSIF v_milestone_status = 'disputed' THEN
    RAISE EXCEPTION 'Milestone is under dispute and cannot be approved';
  ELSIF v_milestone_status != 'submitted' THEN
    RAISE EXCEPTION 'Milestone must be submitted before it can be approved (current status: %)', v_milestone_status;
  END IF;

  -- 6. Update the milestone status
  v_milestone := jsonb_set(v_milestone, '{status}', '"approved"'::jsonb);
  v_updated_milestones := v_milestones;
  v_updated_milestones := jsonb_set(v_updated_milestones, ARRAY[v_milestone_idx::text], v_milestone);

  -- 7. Save updated milestones back to project
  UPDATE projects
  SET milestones = v_updated_milestones, updated_at = NOW()
  WHERE id = v_project_id;

  -- 8. Check if all milestones are now approved
  FOR i IN 0 .. jsonb_array_length(v_updated_milestones) - 1 LOOP
    IF (v_updated_milestones->i->>'status') != 'approved' THEN
      v_all_approved := false;
      EXIT;
    END IF;
  END LOOP;

  -- 9. If all approved, mark contract and project as completed
  IF v_all_approved THEN
    UPDATE contracts SET status = 'completed', updated_at = NOW() WHERE id = p_contract_id;
    UPDATE projects SET status = 'completed', updated_at = NOW() WHERE id = v_project_id;
  END IF;

  -- Return success and necessary data for blockchain execution
  v_result := jsonb_build_object(
    'success', true,
    'milestone_id', p_milestone_id,
    'milestone_amount', v_milestone_amount,
    'contract_completed', v_all_approved,
    'freelancer_id', (SELECT freelancer_id FROM contracts WHERE id = p_contract_id),
    'project_id', v_project_id
  );

  RETURN v_result;
END;
$$;

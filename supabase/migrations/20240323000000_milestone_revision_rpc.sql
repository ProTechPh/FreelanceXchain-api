-- RPC to safely request a revision on a submitted milestone
-- Only employers can request a revision
-- Reverts the milestone status back to 'in_progress'

CREATE OR REPLACE FUNCTION request_milestone_revision(
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
    RAISE EXCEPTION 'Only the contract employer can request milestone revisions';
  END IF;

  -- 3. Verify contract status
  IF v_contract_status != 'active' THEN
    RAISE EXCEPTION 'Cannot request revisions on a % contract', v_contract_status;
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
      EXIT;
    END IF;
  END LOOP;

  IF v_milestone_idx = -1 THEN
    RAISE EXCEPTION 'Milestone not found';
  END IF;

  IF v_milestone_status != 'submitted' THEN
    RAISE EXCEPTION 'Milestone must be submitted before requesting a revision (current status: %)', v_milestone_status;
  END IF;

  -- 6. Revert the milestone status to 'in_progress'
  v_milestone := jsonb_set(v_milestone, '{status}', '"in_progress"'::jsonb);
  v_updated_milestones := v_milestones;
  v_updated_milestones := jsonb_set(v_updated_milestones, ARRAY[v_milestone_idx::text], v_milestone);

  -- 7. Save updated milestones back to project
  UPDATE projects
  SET milestones = v_updated_milestones, updated_at = NOW()
  WHERE id = v_project_id;

  -- Return success
  v_result := jsonb_build_object(
    'success', true,
    'milestone_id', p_milestone_id,
    'project_id', v_project_id
  );

  RETURN v_result;
END;
$$;

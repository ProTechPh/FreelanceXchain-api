-- Fix contracts status constraint
-- The error shows that 'pending' status is being rejected by contracts_status_check
-- This migration ensures the constraint allows all required statuses

-- First, drop the existing constraint if it exists
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;

-- Recreate the constraint with the correct values
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check 
  CHECK (status IN ('pending', 'active', 'completed', 'disputed', 'cancelled'));

-- Verify the constraint
DO $$
BEGIN
  RAISE NOTICE 'Contracts status constraint has been updated to allow: pending, active, completed, disputed, cancelled';
END $$;

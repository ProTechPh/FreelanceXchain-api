-- Audit Logs Migration
-- Tracks all important actions in the system for compliance and security

-- Create audit_log_entries table
CREATE TABLE IF NOT EXISTS audit_log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_id TEXT, -- Can be user email, wallet address, or system identifier
    action TEXT NOT NULL, -- e.g., 'user_created', 'contract_signed', 'payment_released'
    resource_type TEXT NOT NULL, -- e.g., 'user', 'contract', 'payment', 'dispute'
    resource_id UUID, -- ID of the affected resource
    payload JSONB DEFAULT '{}', -- Additional context data
    ip_address INET, -- IP address of the actor
    user_agent TEXT, -- Browser/client information
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
    error_message TEXT, -- If status is failure
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_log_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_log_entries(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_log_entries(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_log_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_log_entries(actor_id);

-- Create a function to automatically log certain table changes
CREATE OR REPLACE FUNCTION log_table_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log INSERT operations
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log_entries (
            user_id,
            action,
            resource_type,
            resource_id,
            payload
        ) VALUES (
            NEW.user_id,
            TG_TABLE_NAME || '_created',
            TG_TABLE_NAME,
            NEW.id,
            to_jsonb(NEW)
        );
        RETURN NEW;
    
    -- Log UPDATE operations
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log_entries (
            user_id,
            action,
            resource_type,
            resource_id,
            payload
        ) VALUES (
            NEW.user_id,
            TG_TABLE_NAME || '_updated',
            TG_TABLE_NAME,
            NEW.id,
            jsonb_build_object(
                'old', to_jsonb(OLD),
                'new', to_jsonb(NEW)
            )
        );
        RETURN NEW;
    
    -- Log DELETE operations
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log_entries (
            user_id,
            action,
            resource_type,
            resource_id,
            payload
        ) VALUES (
            OLD.user_id,
            TG_TABLE_NAME || '_deleted',
            TG_TABLE_NAME,
            OLD.id,
            to_jsonb(OLD)
        );
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers to critical tables (optional - can be enabled per table as needed)
-- Uncomment the tables you want to automatically audit

-- DROP TRIGGER IF EXISTS audit_contracts ON contracts;
-- CREATE TRIGGER audit_contracts
--     AFTER INSERT OR UPDATE OR DELETE ON contracts
--     FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- DROP TRIGGER IF EXISTS audit_payments ON payments;
-- CREATE TRIGGER audit_payments
--     AFTER INSERT OR UPDATE OR DELETE ON payments
--     FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- DROP TRIGGER IF EXISTS audit_disputes ON disputes;
-- CREATE TRIGGER audit_disputes
--     AFTER INSERT OR UPDATE OR DELETE ON disputes
--     FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- DROP TRIGGER IF EXISTS audit_kyc ON kyc_verifications;
-- CREATE TRIGGER audit_kyc
--     AFTER INSERT OR UPDATE OR DELETE ON kyc_verifications
--     FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Add RLS policies for audit logs
ALTER TABLE audit_log_entries ENABLE ROW LEVEL SECURITY;

-- Only admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
    ON audit_log_entries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs"
    ON audit_log_entries FOR SELECT
    USING (user_id = auth.uid());

-- Only system can insert audit logs (via service role)
CREATE POLICY "Service role can insert audit logs"
    ON audit_log_entries FOR INSERT
    WITH CHECK (true);

-- No one can update or delete audit logs (immutable)
CREATE POLICY "Audit logs are immutable"
    ON audit_log_entries FOR UPDATE
    USING (false);

CREATE POLICY "Audit logs cannot be deleted"
    ON audit_log_entries FOR DELETE
    USING (false);

-- Fraud Detection System Migration
-- Monitors suspicious activities and prevents fraud

-- Login attempts tracking
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),
  device_fingerprint VARCHAR(255),
  location_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Device fingerprints
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint VARCHAR(255) NOT NULL,
  device_info JSONB NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_trusted BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, fingerprint)
);

-- Account lockouts
CREATE TABLE IF NOT EXISTS account_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(100) NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  locked_by UUID REFERENCES users(id),
  unlock_token VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'
);

-- Fraud alerts
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'multiple_failed_logins',
    'suspicious_location',
    'duplicate_account',
    'payment_fraud',
    'velocity_check',
    'unusual_activity',
    'account_takeover'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suspicious activities log
CREATE TABLE IF NOT EXISTS suspicious_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Duplicate account detection
CREATE TABLE IF NOT EXISTS duplicate_account_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  potential_duplicate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  similarity_score DECIMAL(5, 2) NOT NULL,
  matching_factors JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id != potential_duplicate_id)
);

-- Indexes
CREATE INDEX idx_login_attempts_user ON login_attempts(user_id);
CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX idx_device_fingerprints_user ON device_fingerprints(user_id);
CREATE INDEX idx_device_fingerprints_fingerprint ON device_fingerprints(fingerprint);
CREATE INDEX idx_account_lockouts_user ON account_lockouts(user_id);
CREATE INDEX idx_account_lockouts_active ON account_lockouts(is_active);
CREATE INDEX idx_fraud_alerts_user ON fraud_alerts(user_id);
CREATE INDEX idx_fraud_alerts_status ON fraud_alerts(status);
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(severity);
CREATE INDEX idx_suspicious_activities_user ON suspicious_activities(user_id);
CREATE INDEX idx_suspicious_activities_type ON suspicious_activities(activity_type);
CREATE INDEX idx_duplicate_checks_user ON duplicate_account_checks(user_id);
CREATE INDEX idx_duplicate_checks_status ON duplicate_account_checks(status);

-- Enable RLS
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_account_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own device fingerprints"
  ON device_fingerprints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own lockouts"
  ON account_lockouts FOR SELECT
  USING (auth.uid() = user_id);

-- Function to check for account lockout
CREATE OR REPLACE FUNCTION is_account_locked(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM account_lockouts
    WHERE user_id = check_user_id
    AND is_active = true
    AND (locked_until IS NULL OR locked_until > NOW())
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create fraud alert on multiple failed logins
CREATE OR REPLACE FUNCTION check_failed_login_attempts()
RETURNS TRIGGER AS $$
DECLARE
  failed_count INTEGER;
  user_uuid UUID;
BEGIN
  IF NEW.success = false THEN
    IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
      SELECT id INTO user_uuid FROM users WHERE email = NEW.email;
    ELSE
      user_uuid := NEW.user_id;
    END IF;
    
    SELECT COUNT(*) INTO failed_count
    FROM login_attempts
    WHERE (user_id = user_uuid OR email = NEW.email)
    AND success = false
    AND created_at > NOW() - INTERVAL '15 minutes';
    
    IF failed_count >= 5 AND user_uuid IS NOT NULL THEN
      INSERT INTO account_lockouts (user_id, reason, locked_until)
      VALUES (user_uuid, 'multiple_failed_logins', NOW() + INTERVAL '30 minutes')
      ON CONFLICT DO NOTHING;
      
      INSERT INTO fraud_alerts (user_id, alert_type, severity, description, metadata)
      VALUES (
        user_uuid,
        'multiple_failed_logins',
        'high',
        'Account locked due to multiple failed login attempts',
        jsonb_build_object('failed_count', failed_count, 'ip_address', NEW.ip_address)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_failed_logins
  AFTER INSERT ON login_attempts
  FOR EACH ROW
  EXECUTE FUNCTION check_failed_login_attempts();

COMMENT ON TABLE login_attempts IS 'Tracks all login attempts for security monitoring';
COMMENT ON TABLE device_fingerprints IS 'Device fingerprinting for fraud detection';
COMMENT ON TABLE account_lockouts IS 'Account lockout management';
COMMENT ON TABLE fraud_alerts IS 'Fraud detection alerts for admin review';

-- Create GDPR consent tracking table
CREATE TABLE IF NOT EXISTS gdpr_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL,
  consent_type VARCHAR(50) NOT NULL, -- 'gps', 'cookies', 'analytics'
  granted BOOLEAN NOT NULL,
  ip_address INET,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (consent_type IN ('gps', 'cookies', 'analytics'))
);

CREATE INDEX idx_gdpr_consents_user ON gdpr_consents(user_id);
CREATE INDEX idx_gdpr_consents_session ON gdpr_consents(session_id);
CREATE INDEX idx_gdpr_consents_timestamp ON gdpr_consents(timestamp DESC);

-- Add screenshot_url column to access_logs if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'access_logs' AND column_name = 'screenshot_url'
  ) THEN
    ALTER TABLE access_logs ADD COLUMN screenshot_url TEXT;
  END IF;
END $$;

-- Create retention policy tracking table
CREATE TABLE IF NOT EXISTS data_retention_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  records_deleted INTEGER NOT NULL DEFAULT 0,
  artifacts_deleted INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  
  UNIQUE(run_date)
);

CREATE INDEX idx_retention_logs_date ON data_retention_logs(run_date DESC);

COMMENT ON TABLE gdpr_consents IS 'GDPR consent tracking for user data collection';
COMMENT ON TABLE data_retention_logs IS 'Audit log for automated data retention cleanup';

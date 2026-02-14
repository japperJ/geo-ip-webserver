-- Migration: access-logs-table
-- Created at: 2026-02-14

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- ============================================================================
-- ACCESS LOGS TABLE (PARTITIONED BY MONTH)
-- ============================================================================
CREATE TABLE access_logs (
    id UUID DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET NOT NULL,
    user_agent TEXT,
    url TEXT,
    allowed BOOLEAN NOT NULL,
    reason VARCHAR(100),
    ip_country VARCHAR(2),
    ip_city VARCHAR(100),
    ip_lat NUMERIC(10, 6),
    ip_lng NUMERIC(10, 6),
    gps_lat NUMERIC(10, 6),
    gps_lng NUMERIC(10, 6),
    gps_accuracy NUMERIC(10, 2),
    screenshot_url TEXT,
    PRIMARY KEY (id, timestamp),
    CHECK (timestamp >= '2026-02-01')
) PARTITION BY RANGE (timestamp);

COMMENT ON TABLE access_logs IS 'HTTP access logs with geolocation data and screenshot URLs (partitioned by month)';
COMMENT ON COLUMN access_logs.allowed IS 'Whether access was allowed based on geofencing/rules';
COMMENT ON COLUMN access_logs.reason IS 'Reason for allow/deny decision';
COMMENT ON COLUMN access_logs.ip_lat IS 'Latitude from IP geolocation (MaxMind)';
COMMENT ON COLUMN access_logs.ip_lng IS 'Longitude from IP geolocation (MaxMind)';
COMMENT ON COLUMN access_logs.gps_lat IS 'Latitude from client GPS/browser';
COMMENT ON COLUMN access_logs.gps_lng IS 'Longitude from client GPS/browser';
COMMENT ON COLUMN access_logs.gps_accuracy IS 'GPS accuracy in meters';
COMMENT ON COLUMN access_logs.screenshot_url IS 'URL to screenshot stored in MinIO';

-- Create first partition for February 2026
CREATE TABLE access_logs_2026_02 PARTITION OF access_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Create indexes on the partition
CREATE INDEX idx_access_logs_2026_02_site ON access_logs_2026_02(site_id, timestamp DESC);
CREATE INDEX idx_access_logs_2026_02_allowed ON access_logs_2026_02(allowed);

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TABLE IF EXISTS access_logs_2026_02;
-- DROP TABLE IF EXISTS access_logs;

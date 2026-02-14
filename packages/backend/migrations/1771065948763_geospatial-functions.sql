-- Migration: geospatial-functions
-- Created at: 2026-02-14

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- ============================================================================
-- FUNCTION: Check if point is within site's geofence polygon
-- ============================================================================
CREATE OR REPLACE FUNCTION is_point_in_geofence(
    p_site_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
    result BOOLEAN;
BEGIN
    SELECT ST_Within(
        ST_GeogFromText(format('POINT(%s %s)', p_longitude, p_latitude))::geometry,
        geofence_polygon::geometry
    )
    INTO result
    FROM sites
    WHERE id = p_site_id
      AND geofence_type = 'polygon'
      AND geofence_polygon IS NOT NULL;
    
    RETURN COALESCE(result, false);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_point_in_geofence IS 
'Check if a lat/lng point is within a site''s polygon geofence using ST_Within. Returns false if site has no polygon geofence.';

-- ============================================================================
-- FUNCTION: Check if point is within site's radius geofence
-- ============================================================================
CREATE OR REPLACE FUNCTION is_point_in_radius(
    p_site_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
    distance_meters NUMERIC;
    radius_meters NUMERIC;
BEGIN
    SELECT 
        ST_Distance(
            geofence_center,
            ST_GeogFromText(format('POINT(%s %s)', p_longitude, p_latitude))
        ),
        geofence_radius_km * 1000
    INTO distance_meters, radius_meters
    FROM sites
    WHERE id = p_site_id
      AND geofence_type = 'radius'
      AND geofence_center IS NOT NULL
      AND geofence_radius_km IS NOT NULL;
    
    RETURN distance_meters <= radius_meters;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_point_in_radius IS 
'Check if a lat/lng point is within a site''s radius geofence. Returns false if site has no radius geofence.';

-- ============================================================================
-- FUNCTION: Auto-create next month partition for access_logs
-- ============================================================================
CREATE OR REPLACE FUNCTION create_next_month_partition()
RETURNS void AS $$
DECLARE
    next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    end_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '2 months');
    partition_name TEXT := 'access_logs_' || TO_CHAR(next_month, 'YYYY_MM');
BEGIN
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF access_logs
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, next_month, end_month
        );
        
        -- Create indexes on the new partition
        EXECUTE format(
            'CREATE INDEX idx_%I_site ON %I(site_id, timestamp DESC)',
            partition_name, partition_name
        );
        EXECUTE format(
            'CREATE INDEX idx_%I_allowed ON %I(allowed)',
            partition_name, partition_name
        );
        
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_next_month_partition IS 
'Manually create the next month partition for access_logs table with indexes';

-- ============================================================================
-- VIEW: Recent access logs with site details
-- ============================================================================
CREATE OR REPLACE VIEW v_recent_access_logs AS
SELECT 
    al.id,
    al.timestamp,
    al.ip_address,
    al.url,
    al.allowed,
    al.reason,
    al.ip_country,
    al.ip_city,
    al.ip_lat,
    al.ip_lng,
    al.gps_lat,
    al.gps_lng,
    al.gps_accuracy,
    al.screenshot_url,
    s.slug AS site_slug,
    s.hostname AS site_hostname,
    s.name AS site_name
FROM access_logs al
JOIN sites s ON al.site_id = s.id
WHERE al.timestamp > NOW() - INTERVAL '7 days'
ORDER BY al.timestamp DESC;

COMMENT ON VIEW v_recent_access_logs IS 
'Recent access logs (last 7 days) with joined site details';

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP VIEW IF EXISTS v_recent_access_logs;
-- DROP FUNCTION IF EXISTS create_next_month_partition();
-- DROP FUNCTION IF EXISTS is_point_in_radius(UUID, NUMERIC, NUMERIC);
-- DROP FUNCTION IF EXISTS is_point_in_geofence(UUID, NUMERIC, NUMERIC);

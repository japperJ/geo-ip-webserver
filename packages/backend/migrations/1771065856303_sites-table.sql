-- Migration: sites-table
-- Created at: 2026-02-14

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- Enable required extensions (already enabled via init script, but ensure)
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- SITES TABLE with PostGIS columns
-- ============================================================================
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    hostname VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    access_mode VARCHAR(20) NOT NULL DEFAULT 'disabled',
    ip_allowlist INET[],
    ip_denylist INET[],
    country_allowlist VARCHAR(2)[],
    country_denylist VARCHAR(2)[],
    block_vpn_proxy BOOLEAN DEFAULT false,
    geofence_type VARCHAR(20),
    geofence_polygon GEOGRAPHY(POLYGON, 4326),
    geofence_center GEOGRAPHY(POINT, 4326),
    geofence_radius_km NUMERIC(10, 2),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    
    CONSTRAINT sites_slug_not_empty CHECK (LENGTH(TRIM(slug)) > 0),
    CONSTRAINT sites_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT sites_access_mode_valid CHECK (access_mode IN ('disabled', 'ip_only', 'geo_only', 'ip_and_geo')),
    CONSTRAINT sites_geofence_type_valid CHECK (geofence_type IS NULL OR geofence_type IN ('polygon', 'radius'))
);

-- CRITICAL: GIST spatial index for performance
CREATE INDEX idx_sites_hostname ON sites(hostname);
CREATE INDEX idx_sites_enabled ON sites(enabled);
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_polygon);

COMMENT ON TABLE sites IS 'Multi-site configuration with geo-fencing and access control';
COMMENT ON COLUMN sites.slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN sites.hostname IS 'Primary hostname for this site (e.g., example.com)';
COMMENT ON COLUMN sites.access_mode IS 'Access control mode: disabled, ip_only, geo_only, ip_and_geo';
COMMENT ON COLUMN sites.geofence_type IS 'Type of geofence: polygon or radius';
COMMENT ON COLUMN sites.geofence_polygon IS 'PostGIS geography polygon (WGS84) for polygon-based geofencing';
COMMENT ON COLUMN sites.geofence_center IS 'Center point for radius-based geofencing';
COMMENT ON COLUMN sites.geofence_radius_km IS 'Radius in kilometers for radius-based geofencing';

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- DROP TABLE IF EXISTS sites;

-- Development seed data

-- Insert example sites
INSERT INTO sites (slug, hostname, name, access_mode, enabled) VALUES
    ('global-site', 'example.com', 'Global Site', 'disabled', true),
    ('eu-site', 'eu.example.com', 'EU Site', 'geofence', true),
    ('apac-site', 'apac.example.com', 'APAC Site', 'geofence', true)
ON CONFLICT (slug) DO NOTHING;

-- Insert example site with polygon geofence (North America)
INSERT INTO sites (slug, hostname, name, access_mode, geofence_type, geofence_polygon, enabled)
VALUES (
    'na-geofence',
    'na.example.com',
    'North America Geofenced Site',
    'geofence',
    'polygon',
    ST_GeogFromText('POLYGON((-125 50, -125 25, -65 25, -65 50, -125 50))'),
    true
)
ON CONFLICT (slug) DO NOTHING;

-- Insert example site with radius geofence (New York)
INSERT INTO sites (slug, hostname, name, access_mode, geofence_type, geofence_center, geofence_radius_km, enabled)
VALUES (
    'nyc-radius',
    'nyc.example.com',
    'NYC Radius Geofenced Site',
    'geofence',
    'radius',
    ST_GeogFromText('POINT(-74.0060 40.7128)'),
    50.0,
    true
)
ON CONFLICT (slug) DO NOTHING;

-- Test geospatial functions

-- Test 1: Find site with polygon geofence
SELECT id, slug, name, geofence_type FROM sites WHERE geofence_type = 'polygon' LIMIT 1;

-- Test 2: Check if New York (40.7128°N, 74.0060°W) is in North America geofence
SELECT 
    slug,
    is_point_in_geofence(id, 40.7128, -74.0060) as is_in_geofence
FROM sites 
WHERE slug = 'na-geofence';

-- Test 3: Check if point outside North America geofence (London: 51.5074°N, 0.1278°W)
SELECT 
    slug,
    is_point_in_geofence(id, 51.5074, -0.1278) as is_in_geofence
FROM sites 
WHERE slug = 'na-geofence';

-- Test 4: Check radius geofence (point near NYC)
SELECT 
    slug,
    is_point_in_radius(id, 40.7589, -73.9851) as is_in_radius
FROM sites 
WHERE slug = 'nyc-radius';

-- Test 5: Check radius geofence (point far from NYC - Los Angeles)
SELECT 
    slug,
    is_point_in_radius(id, 34.0522, -118.2437) as is_in_radius
FROM sites 
WHERE slug = 'nyc-radius';

-- Test 6: Verify partitions exist
SELECT tablename FROM pg_tables WHERE tablename LIKE 'access_logs_%' ORDER BY tablename;

-- Test 7: CRITICAL - ST_Within performance test with EXPLAIN ANALYZE
-- This verifies the GIST index is being used for <1ms queries
EXPLAIN ANALYZE
SELECT ST_Within(
    ST_SetSRID(ST_MakePoint(-74.0060 + (random() * 0.1), 40.7128 + (random() * 0.1)), 4326)::geography,
    geofence_polygon
) as is_within
FROM sites
WHERE geofence_type = 'polygon'
  AND geofence_polygon IS NOT NULL
LIMIT 100;

-- Test 8: Performance test - 1000 geofence checks
EXPLAIN ANALYZE
SELECT is_point_in_geofence(
    (SELECT id FROM sites WHERE slug = 'na-geofence'),
    40.0 + (random() * 10),
    -100.0 + (random() * 30)
)
FROM generate_series(1, 1000);

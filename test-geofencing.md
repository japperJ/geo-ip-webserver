# Geo-Fencing Test Guide

This guide demonstrates how to test the complete geo-fencing functionality with Leaflet + PostGIS.

## Prerequisites

- Backend running on http://localhost:3000 (or http://localhost:3001 for Docker)
- Frontend running on http://localhost:5173 (dev) or http://localhost:8080 (Docker)
- PostgreSQL with PostGIS enabled
- Admin user logged in

## Test Scenario: Create a Geo-Fenced Site

### 1. Create a Test Site with Polygon Geofence

**Example: San Francisco Downtown Area**

```bash
# Login and get JWT token first
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'

# Save the token from response
TOKEN="your_jwt_token_here"

# Create site with polygon geofence (San Francisco downtown)
curl -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "slug": "sf-downtown",
    "name": "San Francisco Downtown Site",
    "access_mode": "geo_only",
    "enabled": true,
    "geofence_type": "polygon",
    "geofence_polygon": {
      "type": "Polygon",
      "coordinates": [[
        [-122.4194, 37.7749],
        [-122.4094, 37.7749],
        [-122.4094, 37.7849],
        [-122.4194, 37.7849],
        [-122.4194, 37.7749]
      ]]
    }
  }'
```

### 2. Create a Test Site with Radius Geofence

**Example: 5km radius around New York City**

```bash
curl -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "slug": "nyc-5km",
    "name": "NYC 5km Radius Site", 
    "access_mode": "geo_only",
    "enabled": true,
    "geofence_type": "radius",
    "geofence_center": {
      "type": "Point",
      "coordinates": [-74.0060, 40.7128]
    },
    "geofence_radius_km": 5
  }'
```

## Test GPS Validation (Public Endpoint)

### Test 1: Coordinates INSIDE the geofence

```bash
# Get site ID from the create response
SITE_ID="your_site_id_here"

# Test GPS coordinates inside San Francisco downtown
curl -X POST http://localhost:3000/api/sites/$SITE_ID/validate-location \
  -H "Content-Type: application/json" \
  -d '{
    "gps_lat": 37.7799,
    "gps_lng": -122.4144,
    "gps_accuracy": 20
  }'

# Expected response:
# {
#   "allowed": true,
#   "site_name": "San Francisco Downtown Site",
#   "access_mode": "geo_only"
# }
```

### Test 2: Coordinates OUTSIDE the geofence

```bash
# Test GPS coordinates in Los Angeles (outside SF)
curl -X POST http://localhost:3000/api/sites/$SITE_ID/validate-location \
  -H "Content-Type: application/json" \
  -d '{
    "gps_lat": 34.0522,
    "gps_lng": -118.2437,
    "gps_accuracy": 20
  }'

# Expected response:
# {
#   "allowed": false,
#   "reason": "outside_geofence",
#   "distance_km": 559.12,  // Distance from nearest boundary
#   "site_name": "San Francisco Downtown Site",
#   "access_mode": "geo_only"
# }
```

### Test 3: Invalid GPS coordinates

```bash
curl -X POST http://localhost:3000/api/sites/$SITE_ID/validate-location \
  -H "Content-Type: application/json" \
  -d '{
    "gps_lat": 999,
    "gps_lng": -122.4144,
    "gps_accuracy": 20
  }'

# Expected response:
# {
#   "allowed": false,
#   "reason": "invalid_gps_coordinates",
#   "site_name": "San Francisco Downtown Site",
#   "access_mode": "geo_only"
# }
```

## Frontend Testing (UI)

### Using the Admin Dashboard

1. **Navigate to Sites**: http://localhost:5173/sites (or :8080 for Docker)

2. **Create New Site**:
   - Click "New Site"
   - Fill in basic info (slug, name)
   - Set Access Mode to "Geo-fencing Only" or "IP + Geo"
   - Scroll to "Geofence Configuration"

3. **Draw Polygon**:
   - Select "Polygon" geofence type
   - Click the polygon drawing tool (top-left of map)
   - Click on the map to draw vertices
   - Click first point again to close the polygon
   - The polygon coordinates will be saved automatically

4. **Draw Circle**:
   - Select "Radius" geofence type
   - Click the circle drawing tool
   - Click center point
   - Drag to set radius
   - The center and radius will be saved automatically

5. **Save the site**

### Testing in Browser Console

```javascript
// Get user's current location
navigator.geolocation.getCurrentPosition(async (position) => {
  const { latitude, longitude, accuracy } = position.coords;
  
  // Validate against site
  const response = await fetch('http://localhost:3000/api/sites/SITE_ID/validate-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gps_lat: latitude,
      gps_lng: longitude,
      gps_accuracy: accuracy
    })
  });
  
  const result = await response.json();
  console.log('Geofence validation:', result);
});
```

## PostGIS Verification (Database)

You can verify the geofence data is stored correctly in PostGIS:

```sql
-- Connect to database
psql -h localhost -p 5434 -U dev_user -d geo_ip_webserver

-- View all geofences
SELECT 
  id,
  name,
  geofence_type,
  ST_AsGeoJSON(geofence_polygon) as polygon_geojson,
  ST_AsGeoJSON(geofence_center) as center_geojson,
  geofence_radius_km
FROM sites
WHERE geofence_type IS NOT NULL;

-- Test a specific point against a polygon geofence
SELECT 
  name,
  ST_Within(
    ST_MakePoint(-122.4144, 37.7799)::geography::geometry,
    geofence_polygon::geometry
  ) as is_within
FROM sites
WHERE geofence_type = 'polygon';

-- Test distance from point to radius center
SELECT 
  name,
  ST_Distance(
    ST_MakePoint(-74.0060, 40.7128)::geography,
    geofence_center::geography
  ) / 1000 as distance_km,
  geofence_radius_km,
  (ST_Distance(
    ST_MakePoint(-74.0060, 40.7128)::geography,
    geofence_center::geography
  ) / 1000) <= geofence_radius_km as is_within
FROM sites
WHERE geofence_type = 'radius';
```

## Integration Test (Full Flow)

1. **Create a site with geofence** (via UI or API)
2. **Enable GPS-based access control** (access_mode = 'geo_only' or 'ip_and_geo')
3. **Call validation endpoint** from different locations
4. **Verify PostGIS calculations** match expectations
5. **Test edge cases**:
   - Exactly on boundary
   - With GPS accuracy buffer
   - With invalid coordinates
   - With missing geofence configuration

## Expected PostGIS Behavior

- **Polygon validation**: Uses `ST_Within()` with accuracy buffering
  - User point is buffered by `gps_accuracy * 1.5` meters
  - Checks if buffered point is within polygon
  - More lenient near boundaries with low GPS accuracy

- **Radius validation**: Uses `ST_DWithin()` 
  - Checks if point is within `radius + (gps_accuracy * 1.5)` meters
  - Returns actual distance from center
  - Accuracy buffer makes it more forgiving

## Common Test Coordinates

| Location | Latitude | Longitude |
|----------|----------|-----------|
| San Francisco | 37.7749 | -122.4194 |
| New York City | 40.7128 | -74.0060 |
| Los Angeles | 34.0522 | -118.2437 |
| London, UK | 51.5074 | -0.1278 |
| Tokyo, Japan | 35.6762 | 139.6503 |

## Success Criteria

✅ Polygon geofences can be drawn in UI using Leaflet Draw
✅ Circle geofences can be drawn in UI using Leaflet Draw  
✅ Geofences are saved to PostGIS (GEOGRAPHY type)
✅ Validation endpoint returns correct results for points inside/outside
✅ GPS accuracy buffering works correctly
✅ Distance calculations are accurate
✅ Invalid coordinates are rejected
✅ Disabled sites return 404
✅ Sites without geo mode return allowed=true

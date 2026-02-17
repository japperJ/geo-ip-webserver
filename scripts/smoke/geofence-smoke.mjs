#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const DEFAULT_SITE_ID = '56ee3df7-8735-4663-9c95-5ba02c5c8715';
const DEFAULT_BACKEND_PORT = '3001';
const DEFAULT_TIMEOUT_MS = 15000;

const DEFAULT_CENTER_LAT = 55.6761; // Copenhagen
const DEFAULT_CENTER_LNG = 12.5683;
const DEFAULT_RADIUS_KM = 2;

const DEFAULT_INSIDE_LAT = 55.6765;
const DEFAULT_INSIDE_LNG = 12.5690;
const DEFAULT_OUTSIDE_LAT = 55.9;
const DEFAULT_OUTSIDE_LNG = 12.9;

const siteId = process.env.SMOKE_SITE_ID || DEFAULT_SITE_ID;
const backendPort = process.env.SMOKE_BACKEND_PORT || DEFAULT_BACKEND_PORT;
const timeoutMs = Number.parseInt(process.env.SMOKE_GEOFENCE_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);

const centerLat = Number.parseFloat(process.env.SMOKE_GEOFENCE_CENTER_LAT || String(DEFAULT_CENTER_LAT));
const centerLng = Number.parseFloat(process.env.SMOKE_GEOFENCE_CENTER_LNG || String(DEFAULT_CENTER_LNG));
const radiusKm = Number.parseFloat(process.env.SMOKE_GEOFENCE_RADIUS_KM || String(DEFAULT_RADIUS_KM));

const insideLat = Number.parseFloat(process.env.SMOKE_GEOFENCE_INSIDE_LAT || String(DEFAULT_INSIDE_LAT));
const insideLng = Number.parseFloat(process.env.SMOKE_GEOFENCE_INSIDE_LNG || String(DEFAULT_INSIDE_LNG));
const outsideLat = Number.parseFloat(process.env.SMOKE_GEOFENCE_OUTSIDE_LAT || String(DEFAULT_OUTSIDE_LAT));
const outsideLng = Number.parseFloat(process.env.SMOKE_GEOFENCE_OUTSIDE_LNG || String(DEFAULT_OUTSIDE_LNG));

if (!/^[0-9a-fA-F-]{36}$/.test(siteId)) {
  fail(`Invalid SMOKE_SITE_ID: ${siteId}`);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  fail(`Invalid SMOKE_GEOFENCE_TIMEOUT_MS: ${process.env.SMOKE_GEOFENCE_TIMEOUT_MS}`);
}

for (const [label, value] of [
  ['centerLat', centerLat],
  ['centerLng', centerLng],
  ['radiusKm', radiusKm],
  ['insideLat', insideLat],
  ['insideLng', insideLng],
  ['outsideLat', outsideLat],
  ['outsideLng', outsideLng],
]) {
  if (!Number.isFinite(value)) {
    fail(`Invalid numeric value for ${label}: ${String(value)}`);
  }
}

const validateLocationUrl = process.env.SMOKE_VALIDATE_LOCATION_URL || `http://localhost:${backendPort}/api/sites/${siteId}/validate-location`;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message, context) {
  if (context) {
    process.stderr.write(`[FAIL] ${message}\n${context}\n`);
  } else {
    process.stderr.write(`[FAIL] ${message}\n`);
  }
  process.exit(1);
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    fail(`${label} failed`, `${result.stderr || result.stdout || 'unknown error'}`.trim());
  }

  return (result.stdout || '').trim();
}

function psql(query) {
  return runCommand(
    'docker',
    [
      'exec',
      'geo-ip-postgres',
      'psql',
      '-U',
      'dev_user',
      '-d',
      'geo_ip_webserver',
      '-t',
      '-A',
      '-F',
      '|',
      '-c',
      query,
    ],
    'psql query',
  );
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonLiteral(value) {
  return sqlLiteral(JSON.stringify(value));
}

function getOriginalSiteConfig() {
  const line = psql(`
SELECT json_build_object(
  'access_mode', access_mode,
  'enabled', enabled,
  'geofence_type', geofence_type,
  'geofence_radius_km', geofence_radius_km,
  'geofence_center', CASE WHEN geofence_center IS NOT NULL THEN ST_AsGeoJSON(geofence_center::geometry)::json ELSE NULL END,
  'geofence_polygon', CASE WHEN geofence_polygon IS NOT NULL THEN ST_AsGeoJSON(geofence_polygon::geometry)::json ELSE NULL END
)::text
FROM sites
WHERE id = ${sqlLiteral(siteId)}
LIMIT 1;
`).split('\n').find(Boolean);

  if (!line) {
    fail('Site not found for geofence smoke test', `site_id=${siteId}`);
  }

  try {
    return JSON.parse(line);
  } catch (error) {
    fail('Failed to parse original site config JSON', String(error));
  }
}

function applyRadiusGeofence() {
  const centerGeoJson = {
    type: 'Point',
    coordinates: [centerLng, centerLat],
  };

  psql(`
UPDATE sites
SET
  access_mode = 'geo_only',
  enabled = true,
  geofence_type = 'radius',
  geofence_polygon = NULL,
  geofence_center = ST_GeomFromGeoJSON(${jsonLiteral(centerGeoJson)}::text)::geography,
  geofence_radius_km = ${radiusKm}
WHERE id = ${sqlLiteral(siteId)};
`);
}

function restoreOriginalSiteConfig(original) {
  const accessMode = sqlLiteral(original.access_mode);
  const enabled = original.enabled ? 'true' : 'false';
  const geofenceType = original.geofence_type ? sqlLiteral(original.geofence_type) : 'NULL';
  const geofenceRadius = original.geofence_radius_km === null || original.geofence_radius_km === undefined
    ? 'NULL'
    : Number(original.geofence_radius_km);

  const centerSql = original.geofence_center
    ? `ST_GeomFromGeoJSON(${jsonLiteral(original.geofence_center)}::text)::geography`
    : 'NULL';

  const polygonSql = original.geofence_polygon
    ? `ST_GeomFromGeoJSON(${jsonLiteral(original.geofence_polygon)}::text)::geography`
    : 'NULL';

  psql(`
UPDATE sites
SET
  access_mode = ${accessMode},
  enabled = ${enabled},
  geofence_type = ${geofenceType},
  geofence_polygon = ${polygonSql},
  geofence_center = ${centerSql},
  geofence_radius_km = ${geofenceRadius}
WHERE id = ${sqlLiteral(siteId)};
`);
}

async function postValidateLocation(lat, lng, accuracy = 10) {
  const response = await fetch(validateLocationUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      gps_lat: lat,
      gps_lng: lng,
      gps_accuracy: accuracy,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const bodyText = await response.text();
  let bodyJson;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    bodyJson = undefined;
  }

  return {
    status: response.status,
    bodyText,
    bodyJson,
  };
}

function expectAllowed(result, label) {
  if (result.status !== 200) {
    fail(`${label} status mismatch`, `expected=200 actual=${result.status} body=${result.bodyText.slice(0, 500)}`);
  }

  if (result.bodyJson?.allowed !== true) {
    fail(`${label} expected allowed=true`, `body=${result.bodyText.slice(0, 500)}`);
  }

  log(`[PASS] ${label} -> allowed=true`);
}

function expectBlockedOutside(result, label) {
  if (result.status !== 200) {
    fail(`${label} status mismatch`, `expected=200 actual=${result.status} body=${result.bodyText.slice(0, 500)}`);
  }

  if (result.bodyJson?.allowed !== false) {
    fail(`${label} expected allowed=false`, `body=${result.bodyText.slice(0, 500)}`);
  }

  const reason = result.bodyJson?.reason;
  if (reason !== 'outside_geofence') {
    fail(`${label} reason mismatch`, `expected=outside_geofence actual=${reason || 'undefined'} body=${result.bodyText.slice(0, 500)}`);
  }

  log(`[PASS] ${label} -> allowed=false (outside_geofence)`);
}

async function main() {
  log('--- Geofence Smoke ---');
  log(`site_id=${siteId}`);
  log(`validate_url=${validateLocationUrl}`);

  const originalConfig = getOriginalSiteConfig();

  try {
    applyRadiusGeofence();

    const inside = await postValidateLocation(insideLat, insideLng, 10);
    expectAllowed(inside, 'Inside-radius coordinate');

    const outside = await postValidateLocation(outsideLat, outsideLng, 10);
    expectBlockedOutside(outside, 'Outside-radius coordinate');

    log('✅ Geofence smoke PASSED');
  } finally {
    restoreOriginalSiteConfig(originalConfig);
    log('↩ Restored original geofence/site config');
  }
}

main().catch((error) => {
  const details = error instanceof Error ? error.stack || error.message : String(error);
  fail('Unhandled geofence smoke error', details);
});

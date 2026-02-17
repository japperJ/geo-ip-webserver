#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const DEFAULT_SITE_ID = '56ee3df7-8735-4663-9c95-5ba02c5c8715';
const DEFAULT_SITE_HOST = 'test.hest.local';
const DEFAULT_BACKEND_PORT = '3001';
const DEFAULT_CONTENT_FILE = 'test.txt';
const DEFAULT_ACTUAL_CLIENT_IP_CIDR = '192.168.32.1/32';
const DEFAULT_NON_MATCHING_ALLOWLIST_IP_CIDR = '198.51.100.7/32';
const DEFAULT_TIMEOUT_MS = 15000;

const siteId = process.env.SMOKE_SITE_ID || DEFAULT_SITE_ID;
const siteHost = process.env.SMOKE_SITE_HOST || DEFAULT_SITE_HOST;
const backendPort = process.env.SMOKE_BACKEND_PORT || DEFAULT_BACKEND_PORT;
const contentFile = process.env.SMOKE_CONTENT_FILE || DEFAULT_CONTENT_FILE;
const actualClientIpCidr = process.env.SMOKE_CLIENT_IP_CIDR || DEFAULT_ACTUAL_CLIENT_IP_CIDR;
const nonMatchingAllowlistIpCidr = process.env.SMOKE_ALLOWLIST_NONMATCH_CIDR || DEFAULT_NON_MATCHING_ALLOWLIST_IP_CIDR;
const timeoutMs = Number.parseInt(process.env.SMOKE_POLICY_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);

if (!/^[0-9a-fA-F-]{36}$/.test(siteId)) {
  fail(`Invalid SMOKE_SITE_ID: ${siteId}`);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  fail(`Invalid SMOKE_POLICY_TIMEOUT_MS: ${process.env.SMOKE_POLICY_TIMEOUT_MS}`);
}

const contentUrl = process.env.SMOKE_CONTENT_URL || `http://${siteHost}:${backendPort}/s/${siteId}/content/${encodeURIComponent(contentFile)}`;

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

function restartBackend() {
  runCommand('docker', ['compose', 'restart', 'backend'], 'backend restart');
}

async function waitForHealth() {
  const healthUrl = `http://localhost:${backendPort}/health`;
  const maxWaitMs = timeoutMs;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (response.status === 200) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  fail('Backend health did not become ready in time', `url=${healthUrl} timeout_ms=${maxWaitMs}`);
}

function toInList(values) {
  if (!values.length) {
    return '';
  }

  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(',');
}

function arraySql(typed, values) {
  if (!values || values.length === 0) {
    return `ARRAY[]::${typed}[]`;
  }

  return `ARRAY[${toInList(values)}]::${typed}[]`;
}

function parseArray(value) {
  if (!value || value === '{}' || value === 'NULL') {
    return [];
  }

  const inner = value.slice(1, -1);
  if (!inner) {
    return [];
  }

  return inner.split(',').map((item) => item.trim()).filter(Boolean);
}

async function requestContent() {
  const response = await fetch(contentUrl, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  return {
    status: response.status,
    headers: response.headers,
    bodyText: text,
    bodyJson: json,
  };
}

function expectReason(result, expectedStatus, expectedReason, label) {
  if (result.status !== expectedStatus) {
    fail(`${label} status mismatch`, `expected=${expectedStatus} actual=${result.status} body=${result.bodyText.slice(0, 500)}`);
  }

  const reason = result.bodyJson?.reason;
  if (reason !== expectedReason) {
    fail(`${label} reason mismatch`, `expected=${expectedReason} actual=${reason || 'undefined'} body=${result.bodyText.slice(0, 500)}`);
  }

  log(`[PASS] ${label} -> ${expectedStatus} (${expectedReason})`);
}

function expectAllowedRedirect(result, label) {
  if (result.status !== 302) {
    fail(`${label} expected 302`, `actual=${result.status} body=${result.bodyText.slice(0, 500)}`);
  }

  const location = result.headers.get('location') || '';
  if (!location.includes('/site-assets/') || !location.includes('/content/')) {
    fail(`${label} missing signed redirect`, `location=${location}`);
  }

  log(`[PASS] ${label} -> 302 (signed redirect)`);
}

function getOriginalPolicy() {
  const line = psql(`
SELECT
  access_mode,
  COALESCE(ip_allowlist::text, 'NULL'),
  COALESCE(ip_denylist::text, 'NULL'),
  COALESCE(country_allowlist::text, 'NULL'),
  COALESCE(country_denylist::text, 'NULL')
FROM sites
WHERE id = '${siteId}'
LIMIT 1;
`).split('\n').filter(Boolean)[0];

  if (!line) {
    fail('Site not found for smoke policy test', `site_id=${siteId}`);
  }

  const [accessMode, ipAllowRaw, ipDenyRaw, countryAllowRaw, countryDenyRaw] = line.split('|');

  return {
    accessMode,
    ipAllowlist: parseArray(ipAllowRaw),
    ipDenylist: parseArray(ipDenyRaw),
    countryAllowlist: parseArray(countryAllowRaw),
    countryDenylist: parseArray(countryDenyRaw),
  };
}

function applyPolicy({ accessMode, ipAllowlist, ipDenylist, countryAllowlist, countryDenylist }) {
  psql(`
UPDATE sites
SET
  access_mode = '${accessMode}',
  ip_allowlist = ${arraySql('inet', ipAllowlist)},
  ip_denylist = ${arraySql('inet', ipDenylist)},
  country_allowlist = ${arraySql('varchar', countryAllowlist)},
  country_denylist = ${arraySql('varchar', countryDenylist)}
WHERE id = '${siteId}';
`);
}

async function main() {
  log('--- Policy Smoke ---');
  log(`site_id=${siteId}`);
  log(`url=${contentUrl}`);

  const originalPolicy = getOriginalPolicy();

  try {
    // Test 1: denylist should block actual client IP
    applyPolicy({
      accessMode: 'ip_only',
      ipAllowlist: [],
      ipDenylist: [actualClientIpCidr],
      countryAllowlist: [],
      countryDenylist: [],
    });
    restartBackend();
    await waitForHealth();
    const denyResult = await requestContent();
    expectReason(denyResult, 403, 'ip_denylist', 'IP denylist block');

    // Test 2: allowlist mismatch should block
    applyPolicy({
      accessMode: 'ip_only',
      ipAllowlist: [nonMatchingAllowlistIpCidr],
      ipDenylist: [],
      countryAllowlist: [],
      countryDenylist: [],
    });
    restartBackend();
    await waitForHealth();
    const allowMismatchResult = await requestContent();
    expectReason(allowMismatchResult, 403, 'ip_not_in_allowlist', 'IP allowlist mismatch');

    // Test 3: allowlist match should pass
    applyPolicy({
      accessMode: 'ip_only',
      ipAllowlist: [actualClientIpCidr],
      ipDenylist: [],
      countryAllowlist: [],
      countryDenylist: [],
    });
    restartBackend();
    await waitForHealth();
    const allowResult = await requestContent();
    expectAllowedRedirect(allowResult, 'IP allowlist match');

    // Optional country sanity check in no-GeoIP mode
    applyPolicy({
      accessMode: 'ip_only',
      ipAllowlist: [],
      ipDenylist: [],
      countryAllowlist: ['DK'],
      countryDenylist: [],
    });
    restartBackend();
    await waitForHealth();
    const countryResult = await requestContent();
    if (countryResult.status === 403 && countryResult.bodyJson?.reason === 'country_not_allowed') {
      log('[PASS] Country allowlist sanity -> 403 (country_not_allowed)');
    } else if (countryResult.status === 302) {
      log('[PASS] Country allowlist sanity -> 302 (GeoIP matched allowlist)');
    } else {
      fail('Country allowlist sanity returned unexpected result', `status=${countryResult.status} body=${countryResult.bodyText.slice(0, 500)}`);
    }

    log('✅ Policy smoke PASSED');
  } finally {
    applyPolicy({
      accessMode: originalPolicy.accessMode,
      ipAllowlist: originalPolicy.ipAllowlist,
      ipDenylist: originalPolicy.ipDenylist,
      countryAllowlist: originalPolicy.countryAllowlist,
      countryDenylist: originalPolicy.countryDenylist,
    });

    restartBackend();
    await waitForHealth();
    log('↩ Restored original site policy');
  }
}

main().catch((error) => {
  const details = error instanceof Error ? error.stack || error.message : String(error);
  fail('Unhandled policy smoke error', details);
});

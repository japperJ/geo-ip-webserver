#!/usr/bin/env node

const DEFAULT_BACKEND_BASE_URL = 'http://localhost:3001';
const DEFAULT_PROXY_BASE_URL = 'http://localhost:8080';
const DEFAULT_EMAIL = 'admin@test.local';
const DEFAULT_PASSWORD = 'Test123!@#';
const DEFAULT_HTTP_TIMEOUT_MS = 10000;

function getHttpTimeoutMs() {
  const rawValue = process.env.SMOKE_HTTP_TIMEOUT_MS;
  if (!rawValue) {
    return DEFAULT_HTTP_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail('Invalid SMOKE_HTTP_TIMEOUT_MS value', `value=${rawValue}`);
  }

  return parsed;
}

function normalizeBaseUrl(input) {
  return input.replace(/\/$/, '');
}

function logStep(message) {
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

async function parseJsonResponse(response, label) {
  const bodyText = await response.text();
  try {
    const json = JSON.parse(bodyText);
    return { json, bodyText };
  } catch {
    fail(`${label} returned non-JSON payload`, `status=${response.status} body=${bodyText.slice(0, 500)}`);
  }
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function extractRefreshCookie(response) {
  const setCookieHeaders = getSetCookieHeaders(response);
  const refreshCookie = setCookieHeaders.find((header) => header.startsWith('refreshToken='));

  if (!refreshCookie) {
    return null;
  }

  return refreshCookie.split(';')[0];
}

async function expect200(url, label) {
  const timeoutMs = getHttpTimeoutMs();
  let response;

  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    fail(`${label} failed`, `url=${url} timeout_ms=${timeoutMs} error=${details}`);
  }

  if (response.status !== 200) {
    const bodyText = await response.text();
    fail(`${label} failed`, `url=${url} status=${response.status} body=${bodyText.slice(0, 500)}`);
  }

  logStep(`[PASS] ${label} (${url}) -> 200`);
  return response;
}

async function run() {
  const backendBaseUrl = normalizeBaseUrl(process.env.BACKEND_BASE_URL || DEFAULT_BACKEND_BASE_URL);
  const proxyBaseUrlRaw = process.env.PROXY_BASE_URL;
  const proxyBaseUrl = proxyBaseUrlRaw === undefined
    ? DEFAULT_PROXY_BASE_URL
    : proxyBaseUrlRaw.trim() === ''
      ? null
      : normalizeBaseUrl(proxyBaseUrlRaw);
  const email = process.env.SMOKE_AUTH_EMAIL || DEFAULT_EMAIL;
  const password = process.env.SMOKE_AUTH_PASSWORD || DEFAULT_PASSWORD;

  logStep('--- Phase G HTTP Smoke ---');
  logStep(`backend=${backendBaseUrl}`);
  logStep(`proxy=${proxyBaseUrl ?? '(disabled)'}`);

  await expect200(`${backendBaseUrl}/health`, 'backend health');
  await expect200(`${backendBaseUrl}/documentation`, 'backend docs UI');

  const backendOpenApiResponse = await expect200(`${backendBaseUrl}/documentation/json`, 'backend docs JSON');
  const { json: backendOpenApiJson } = await parseJsonResponse(backendOpenApiResponse, 'backend docs JSON');
  if (!backendOpenApiJson.openapi) {
    fail('backend docs JSON missing "openapi" field');
  }
  logStep('[PASS] backend docs JSON is parseable OpenAPI');

  if (proxyBaseUrl) {
    await expect200(`${proxyBaseUrl}/documentation`, 'proxy docs UI');

    const proxyOpenApiResponse = await expect200(`${proxyBaseUrl}/documentation/json`, 'proxy docs JSON');
    const { json: proxyOpenApiJson } = await parseJsonResponse(proxyOpenApiResponse, 'proxy docs JSON');
    if (!proxyOpenApiJson.openapi) {
      fail('proxy docs JSON missing "openapi" field');
    }
    logStep('[PASS] proxy docs JSON is parseable OpenAPI');
  }

  const registerResponse = await fetch(`${backendBaseUrl}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(getHttpTimeoutMs()),
    body: JSON.stringify({ email, password }),
  });

  if (registerResponse.status !== 201 && registerResponse.status !== 409) {
    const bodyText = await registerResponse.text();
    fail('auth register failed', `status=${registerResponse.status} body=${bodyText.slice(0, 500)}`);
  }
  logStep(`[PASS] auth register (${registerResponse.status === 201 ? 'created' : 'already exists'})`);

  const loginResponse = await fetch(`${backendBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(getHttpTimeoutMs()),
    body: JSON.stringify({ email, password }),
  });

  if (loginResponse.status !== 200) {
    const bodyText = await loginResponse.text();
    fail('auth login failed', `status=${loginResponse.status} body=${bodyText.slice(0, 500)}`);
  }

  const { json: loginPayload } = await parseJsonResponse(loginResponse, 'auth login');
  const accessToken = loginPayload?.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    fail('auth login succeeded but no accessToken returned');
  }
  logStep('[PASS] auth login returned access token');

  const meResponse = await fetch(`${backendBaseUrl}/api/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(getHttpTimeoutMs()),
  });

  if (meResponse.status !== 200) {
    const bodyText = await meResponse.text();
    fail('auth /api/auth/me failed', `status=${meResponse.status} body=${bodyText.slice(0, 500)}`);
  }
  logStep('[PASS] auth /api/auth/me reachable with bearer token');

  const refreshCookie = extractRefreshCookie(loginResponse);
  if (!refreshCookie) {
    fail('auth login did not return refreshToken cookie');
  }

  const refreshResponse = await fetch(`${backendBaseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      Cookie: refreshCookie,
    },
    signal: AbortSignal.timeout(getHttpTimeoutMs()),
  });

  if (refreshResponse.status !== 200) {
    const bodyText = await refreshResponse.text();
    fail('auth refresh failed', `status=${refreshResponse.status} body=${bodyText.slice(0, 500)}`);
  }

  const { json: refreshPayload } = await parseJsonResponse(refreshResponse, 'auth refresh');
  if (typeof refreshPayload?.accessToken !== 'string' || refreshPayload.accessToken.length === 0) {
    fail('auth refresh returned 200 but no accessToken');
  }
  logStep('[PASS] auth /api/auth/refresh returned access token');

  logStep('✅ Phase G HTTP smoke PASSED');
}

run().catch((error) => {
  const details = error instanceof Error ? error.stack || error.message : String(error);
  fail('Unhandled smoke error', details);
});

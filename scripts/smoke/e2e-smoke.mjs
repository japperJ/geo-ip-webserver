#!/usr/bin/env node

import { spawn } from 'node:child_process';

const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const DEFAULT_E2E_TIMEOUT_MS = 300000;

function getE2ETimeoutMs() {
  const rawValue = process.env.SMOKE_E2E_TIMEOUT_MS;
  if (!rawValue) {
    return DEFAULT_E2E_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    process.stderr.write(`[FAIL] Invalid SMOKE_E2E_TIMEOUT_MS value: ${rawValue}\n`);
    process.exit(1);
  }

  return parsed;
}

function buildSafeEnv() {
  const safeEnvEntries = Object.entries(process.env).filter(([, value]) => value !== undefined);
  return {
    ...Object.fromEntries(safeEnvEntries),
    PLAYWRIGHT_BASE_URL,
  };
}

function terminateChildProcessTree(child) {
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
    });
    killer.unref();
    return;
  }

  child.kill('SIGTERM');
}

function run() {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', 'test:e2e', '-w', 'packages/frontend', '--', 'e2e/smoke.spec.ts'];
  const timeoutMs = getE2ETimeoutMs();

  const child = spawn(command, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: buildSafeEnv(),
  });

  let didTimeout = false;
  const timeoutHandle = setTimeout(() => {
    didTimeout = true;
    process.stderr.write(`[FAIL] Playwright smoke timed out after ${timeoutMs}ms\n`);
    terminateChildProcessTree(child);

    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 5000).unref();
  }, timeoutMs);

  timeoutHandle.unref();

  child.on('exit', (code, signal) => {
    clearTimeout(timeoutHandle);

    if (didTimeout) {
      process.exit(1);
    }

    if (signal) {
      process.stderr.write(`[FAIL] Playwright smoke terminated by signal: ${signal}\n`);
      process.exit(1);
    }

    if (code !== 0) {
      process.stderr.write(`[FAIL] Playwright smoke failed with exit code ${code}\n`);
      process.exit(code ?? 1);
    }

    process.stdout.write('✅ Playwright smoke PASSED\n');
    process.exit(0);
  });
}

run();

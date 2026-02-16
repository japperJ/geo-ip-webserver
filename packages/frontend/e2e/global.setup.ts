import type { FullConfig } from '@playwright/test';

const REACHABILITY_TIMEOUT_MS = 5000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const envBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

  if (!envBaseUrl) {
    return;
  }

  const projectBaseUrl = config.projects[0]?.use?.baseURL;
  const targetUrl = String(projectBaseUrl ?? envBaseUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);

  try {
    await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[playwright global setup] PLAYWRIGHT_BASE_URL is set but unreachable: ${targetUrl}. ` +
        `Failed HEAD check within ${REACHABILITY_TIMEOUT_MS}ms. Details: ${details}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

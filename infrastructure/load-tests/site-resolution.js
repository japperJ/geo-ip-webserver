import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const cacheHitRate = new Rate('cache_hits');
const latencyTrend = new Trend('request_latency');

// Load test configuration
export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '3m', target: 100 },   // Stay at 100 users
    { duration: '1m', target: 500 },   // Ramp up to 500 users
    { duration: '3m', target: 500 },   // Stay at 500 users
    { duration: '1m', target: 1000 },  // Ramp up to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users (peak load)
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<100'], // 95% of requests should be below 100ms
    'http_req_failed': ['rate<0.01'],   // Error rate should be below 1%
    'cache_hits': ['rate>0.95'],        // Cache hit rate should be >95%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test hostnames (configure your test sites)
const testHosts = [
  'site1.example.com',
  'site2.example.com',
  'site3.example.com',
];

export default function () {
  // Select random test host
  const hostname = testHosts[Math.floor(Math.random() * testHosts.length)];

  // Make request with hostname header
  const res = http.get(`${BASE_URL}/test-protected`, {
    headers: {
      'Host': hostname,
    },
  });

  // Check response
  const success = check(res, {
    'status is 200 or 403': (r) => r.status === 200 || r.status === 403,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });

  // Record metrics
  errorRate.add(!success);
  latencyTrend.add(res.timings.duration);

  // Sleep for 100ms-500ms to simulate user think time
  sleep(Math.random() * 0.4 + 0.1);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = `
${indent}Summary:
${indent}  Total Requests: ${data.metrics.http_reqs.values.count}
${indent}  Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)}/s
${indent}  Failed Requests: ${data.metrics.http_req_failed.values.rate.toFixed(4) * 100}%
${indent}
${indent}Latency:
${indent}  P50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms
${indent}  P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
${indent}  P99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms
${indent}  Max: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms
${indent}
${indent}Thresholds:
`;

  for (const [name, threshold] of Object.entries(data.thresholds)) {
    const passed = !threshold.values || threshold.ok;
    const status = passed ? '✓' : '✗';
    summary += `${indent}  ${status} ${name}\n`;
  }

  return summary;
}

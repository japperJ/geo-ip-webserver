import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200'],
    'http_req_failed': ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Test GPS geofencing endpoint
  const payload = JSON.stringify({
    latitude: 37.7749,  // San Francisco
    longitude: -122.4194,
    accuracy: 20,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Host': 'site1.example.com',
    },
  };

  const res = http.post(`${BASE_URL}/api/check-access`, payload, params);

  check(res, {
    'status is 200 or 403': (r) => r.status === 200 || r.status === 403,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has decision': (r) => r.json('allowed') !== undefined,
  });

  sleep(1);
}

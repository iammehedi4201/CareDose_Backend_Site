import http from 'k6/http';
import { check, group, sleep } from 'k6';

/**
 * CareDose Staging / Pre-Production Load Test Suite (Documentation v1.5 Section 10.11)
 *
 * Run against a staging or test API server (never production data):
 *   k6 run -e BASE_URL=http://localhost:3000/api/v1 backend/load/caredose-api-load.js
 */
export const options = {
  scenarios: {
    catalogue_browsing: {
      executor: 'ramping-vus',
      exec: 'catalogueBrowseFlow',
      startVUs: 2,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '40s', target: 25 },
        { duration: '15s', target: 0 },
      ],
    },
    caregiver_tracking: {
      executor: 'ramping-vus',
      exec: 'caregiverTrackingFlow',
      startVUs: 1,
      stages: [
        { duration: '20s', target: 10 },
        { duration: '40s', target: 15 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const SEARCH_TERMS = ['Napa', 'Paracetamol', 'Seclo', 'Metformin', 'Tablet'];

export function catalogueBrowseFlow() {
  group('health & catalogue search', () => {
    const readyRes = http.get(`${BASE_URL}/health/ready`);
    check(readyRes, {
      'readiness status 200': (r) => r.status === 200,
    });

    const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
    const searchRes = http.get(
      `${BASE_URL}/catalogue/search?q=${encodeURIComponent(term)}&limit=15`,
    );
    check(searchRes, {
      'catalogue search 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);
}

export function caregiverTrackingFlow() {
  const uniqueEmail = `k6-vu${__VU}-iter${__ITER}-${Date.now()}@example.com`;
  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({
      email: uniqueEmail,
      password: 'LoadTestPassword123!',
      displayName: `Caregiver VU ${__VU}`,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (!check(registerRes, { 'register 201': (r) => r.status === 201 })) {
    sleep(1);
    return;
  }

  const regJson = registerRes.json();
  const token = regJson.accessToken;
  const patientId = regJson.defaultPatientProfile && regJson.defaultPatientProfile.id;
  if (!token || !patientId) {
    return;
  }

  const authHeaders = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  group('private patient endpoints & idempotency check', () => {
    const medRes = http.post(
      `${BASE_URL}/patients/${patientId}/medications`,
      JSON.stringify({
        name: 'Napa Load Test 500 mg',
        dosageForm: 'Tablet',
        personalInstructions: '1 tablet morning',
        startingStock: 20,
        stockUnit: 'tablets',
        lowStockThreshold: 5,
      }),
      authHeaders,
    );
    check(medRes, { 'create med 201': (r) => r.status === 201 });

    const medId = medRes.json() && medRes.json().id;
    if (medId) {
      const today = new Date().toISOString().slice(0, 10);
      const schedRes = http.post(
        `${BASE_URL}/patient-medications/${medId}/schedules`,
        JSON.stringify({
          doseAmount: 1,
          doseUnit: 'tablet',
          frequency: 'DAILY',
          scheduledTimes: ['08:00'],
          startDate: today,
          remindersEnabled: true,
        }),
        authHeaders,
      );
      check(schedRes, { 'create schedule 201': (r) => r.status === 201 });
    }

    const dosesRes = http.get(
      `${BASE_URL}/patients/${patientId}/doses?days=1`,
      authHeaders,
    );
    check(dosesRes, { 'list daily doses 200': (r) => r.status === 200 });

    const healthRes = http.post(
      `${BASE_URL}/patients/${patientId}/health-readings`,
      JSON.stringify({
        value: 108,
        unit: 'MG_DL',
        context: 'FASTING',
      }),
      authHeaders,
    );
    check(healthRes, { 'create reading 201': (r) => r.status === 201 });

    const expRes = http.get(
      `${BASE_URL}/patients/${patientId}/expenses?monthsCount=6`,
      authHeaders,
    );
    check(expRes, { 'expenses summary 200': (r) => r.status === 200 });
  });

  sleep(0.5);
}

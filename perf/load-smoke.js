// Load smoke test for DutyHub. Runs against a live API + Postgres + Redis
// stack (docker-compose) with a real Cognito user pool. Not a stress test —
// the intent is to catch p95 regressions on the hot paths a professional
// touches every day, at a load slightly above realistic peak.
//
// Load profile (~2 minutes total):
//   30s ramp-up  → 25 VUs
//   60s steady   → 25 VUs
//   30s ramp-down → 0
//
// Thresholds:
//   * >99% of requests succeed (http_req_failed rate < 0.01)
//   * hot GET endpoints: p95 < 500ms
//   * heavier GET endpoints: p95 < 2000ms
//
// Failing a threshold fails the k6 exit code, which the workflow surfaces
// as a check failure. Adjust thresholds after a few runs settle a baseline.

import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const COGNITO_REGION = __ENV.COGNITO_REGION || 'us-east-1';
const COGNITO_CLIENT_ID = __ENV.COGNITO_CLIENT_ID;
const USER_EMAIL = __ENV.USER_EMAIL || 'medico@plantonhub.com';
const USER_PASSWORD = __ENV.USER_PASSWORD || 'Teste@123';

export const options = {
    stages: [
        { duration: '30s', target: 25 },
        { duration: '60s', target: 25 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        // Overall reliability. If more than 1% of requests fail during the
        // run the API is not shippable — fail the workflow.
        http_req_failed: ['rate<0.01'],
        // Hot endpoints — hit on every professional page load. Tight budget.
        'http_req_duration{group:hot}': ['p(95)<500'],
        // Heavier endpoints — aggregations, joins. Looser budget.
        'http_req_duration{group:heavy}': ['p(95)<2000'],
    },
    // Don't leak the token into every VU init — do it once in setup().
    // 30s is enough for Cognito ADMIN_INITIATE_AUTH on a fresh pool.
    setupTimeout: '60s',
};

/**
 * Authenticate once via Cognito USER_PASSWORD_AUTH (public app client, no
 * secret). Reuses the same flow as amazon-cognito-identity-js in the
 * frontend. All VUs share the resulting id token — the token has a 1h TTL
 * which is more than enough for a 2min run.
 */
export function setup() {
    if (!COGNITO_CLIENT_ID) {
        throw new Error(
            'COGNITO_CLIENT_ID is required. Set it via workflow secrets or --env COGNITO_CLIENT_ID=...',
        );
    }

    const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
    const body = JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: COGNITO_CLIENT_ID,
        AuthParameters: {
            USERNAME: USER_EMAIL,
            PASSWORD: USER_PASSWORD,
        },
    });
    const params = {
        headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        tags: { name: 'auth' },
    };

    const res = http.post(url, body, params);
    if (res.status !== 200) {
        throw new Error(`Cognito auth failed: ${res.status} ${res.body}`);
    }
    const auth = res.json();
    if (!auth.AuthenticationResult || !auth.AuthenticationResult.IdToken) {
        throw new Error(`Cognito auth returned unexpected shape: ${res.body}`);
    }

    return { idToken: auth.AuthenticationResult.IdToken };
}

export default function (data) {
    const headers = {
        Authorization: `Bearer ${data.idToken}`,
        'Content-Type': 'application/json',
    };
    const params = (group) => ({ headers, tags: { group } });

    // Hot path — every /doctor page load hits these.
    group('hot', () => {
        const responses = {
            session: http.get(`${BASE_URL}/api/auth/session`, params('hot')),
            clinics: http.get(`${BASE_URL}/api/clinics`, params('hot')),
            todayShifts: http.get(`${BASE_URL}/api/shifts/me/today`, params('hot')),
            attendanceStatus: http.get(`${BASE_URL}/api/attendance/status`, params('hot')),
            activeAttendance: http.get(`${BASE_URL}/api/attendance/active`, params('hot')),
        };

        for (const [name, res] of Object.entries(responses)) {
            check(res, {
                [`${name}: status 200`]: (r) => r.status === 200,
            });
        }
    });

    // Simulate the pause between a page load and the user's next action.
    sleep(0.5);

    // Heavier reads — history aggregation, cross-clinic shift list.
    group('heavy', () => {
        const responses = {
            myShifts: http.get(`${BASE_URL}/api/shifts/me`, params('heavy')),
            myHistory: http.get(`${BASE_URL}/api/attendance/my-history`, params('heavy')),
        };

        for (const [name, res] of Object.entries(responses)) {
            check(res, {
                [`${name}: status 200`]: (r) => r.status === 200,
            });
        }
    });

    sleep(1);
}

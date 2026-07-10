// Check-in/check-out cycle — testa o caminho completo de escrita para um
// único médico rodando iterações sequenciais. Não paraleliza porque a regra
// de negócio permite apenas UM plantão ativo por usuário.
//
// Para testar sob concorrência real seria preciso vários usuários seedados
// (um por VU). Este cenário mede latência das operações críticas.
//
//   k6 run tests/k6/scenarios/checkin-cycle.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, DEFAULT_THRESHOLDS } from '../config.js';
import { login, authHeaders } from '../lib/auth.js';

export const options = {
  vus: 1,
  iterations: 20,
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    // Escrita costuma ser mais cara que leitura; afrouxa um pouco:
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

export function setup() {
  return login();
}

export default function (session) {
  const headers = authHeaders(session);

  // Descobre um shiftId válido para hoje
  const shiftsRes = http.get(`${BASE_URL}/shifts/me/today`, {
    headers,
    tags: { name: 'GET /shifts/me/today' },
  });
  check(shiftsRes, { 'shifts: 200': (r) => r.status === 200 });

  const shifts = shiftsRes.json();
  if (!Array.isArray(shifts) || shifts.length === 0) {
    // Sem plantão atribuído hoje — pula essa iteração
    sleep(0.5);
    return;
  }
  const shiftId = shifts[0].id;

  // Se já houver check-in ativo, encerra antes para garantir estado limpo
  const activeRes = http.get(`${BASE_URL}/attendance/active`, {
    headers,
    tags: { name: 'GET /attendance/active' },
  });
  const active = activeRes.json();
  if (Array.isArray(active) && active.length > 0) {
    doCheckOut(session, active[0].shiftId);
  }

  group('Check-in', () => {
    const res = http.post(
      `${BASE_URL}/attendance/check-in`,
      JSON.stringify({
        shiftId,
        latitude:  -23.5505,
        longitude: -46.6333,
        deviceId:  'k6-load-test-device',
        biometricValidated: true,
      }),
      { headers, tags: { name: 'POST /attendance/check-in' } }
    );
    check(res, { 'check-in: 201': (r) => r.status === 201 });
  });

  sleep(0.5);

  doCheckOut(session, shiftId);
  sleep(0.5);
}

function doCheckOut(session, shiftId) {
  const headers = authHeaders(session);
  const res = http.post(
    `${BASE_URL}/attendance/check-out`,
    JSON.stringify({
      shiftId,
      latitude:  -23.5505,
      longitude: -46.6333,
      deviceId:  'k6-load-test-device',
    }),
    { headers, tags: { name: 'POST /attendance/check-out' } }
  );
  check(res, { 'check-out: 200': (r) => r.status === 200 });
}

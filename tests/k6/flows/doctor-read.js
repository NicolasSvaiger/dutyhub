import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL } from '../config.js';
import { authHeaders } from '../lib/auth.js';

/**
 * Executa os fluxos de LEITURA que um médico faz ao abrir a tela inicial:
 *   1. Lista clínicas autorizadas
 *   2. Lista plantões de hoje na clínica ativa
 *   3. Lista check-ins ativos
 *   4. Consulta histórico
 *
 * Cada requisição é validada e recebe uma tag para relatório agregado.
 *
 * @param {import('../lib/auth.js').login extends (...a:any)=>infer R ? R : never} session
 */
export function doctorReadFlow(session) {
  const headers = authHeaders(session);

  group('Clínicas', () => {
    const res = http.get(`${BASE_URL}/clinics`, {
      headers,
      tags: { name: 'GET /clinics' },
    });
    check(res, {
      'clinics: 200': (r) => r.status === 200,
      'clinics: array': (r) => Array.isArray(r.json()),
    });
  });

  group('Plantões de hoje', () => {
    const res = http.get(`${BASE_URL}/shifts/me/today`, {
      headers,
      tags: { name: 'GET /shifts/me/today' },
    });
    check(res, { 'shifts/me/today: 200': (r) => r.status === 200 });
  });

  group('Check-ins ativos', () => {
    const res = http.get(`${BASE_URL}/attendance/active`, {
      headers,
      tags: { name: 'GET /attendance/active' },
    });
    check(res, { 'attendance/active: 200': (r) => r.status === 200 });
  });

  group('Histórico', () => {
    const res = http.get(`${BASE_URL}/attendance/my-history`, {
      headers,
      tags: { name: 'GET /attendance/my-history' },
    });
    check(res, { 'attendance/my-history: 200': (r) => r.status === 200 });
  });

  // Simula o think-time do usuário entre iterações
  sleep(1);
}

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL } from '../config.js';
import { authHeaders } from '../lib/auth.js';

/**
 * Fluxo de LEITURA do portal Prefeitura — o que um gestor faz ao abrir
 * o painel: dashboard do dia + KPIs consolidados do último mês + agregação
 * de frequência + estado em tempo real das UPAs.
 *
 * Cada endpoint é filtrado por escopo (organId do gestor autenticado,
 * resolvido via claim JWT `publicOrganId` ou fallback DB no TenantMiddleware).
 * Todos são reads → seguros de rodar em paralelo com vários VUs, com resposta
 * cacheada em Redis (TTLs configurados em CacheKeys.Prefeitura*).
 *
 * As tags por endpoint permitem o relatório k6 quebrar as latências por
 * rota — útil pra identificar qual endpoint está degradando primeiro
 * quando você escalar o número de VUs (ex: se realtime cair antes de kpis,
 * é sinal pra revisitar o TTL de cache do realtime).
 *
 * @param {import('../lib/auth.js').login extends (...a:any)=>infer R ? R : never} session
 */
export function prefeituraReadFlow(session) {
  const headers = authHeaders(session);

  group('Dashboard', () => {
    const res = http.get(`${BASE_URL}/prefeitura/dashboard`, {
      headers,
      tags: { name: 'GET /prefeitura/dashboard' },
    });
    check(res, {
      'dashboard: 200': (r) => r.status === 200,
      'dashboard: tem periodLabel': (r) => {
        try {
          return typeof r.json().periodLabel === 'string';
        } catch {
          return false;
        }
      },
    });
  });

  group('KPIs', () => {
    // Sem query params → backend usa defaults (últimos 30 dias) — mesma
    // fetch inicial que a UI faz no mount da view Kpis.
    const res = http.get(`${BASE_URL}/prefeitura/kpis`, {
      headers,
      tags: { name: 'GET /prefeitura/kpis' },
    });
    check(res, {
      'kpis: 200': (r) => r.status === 200,
      'kpis: tem globalComplianceRate': (r) => {
        try {
          return typeof r.json().globalComplianceRate === 'number';
        } catch {
          return false;
        }
      },
    });
  });

  group('Frequência', () => {
    const res = http.get(`${BASE_URL}/prefeitura/frequency`, {
      headers,
      tags: { name: 'GET /prefeitura/frequency' },
    });
    check(res, {
      'frequency: 200': (r) => r.status === 200,
      'frequency: array': (r) => {
        try {
          return Array.isArray(r.json());
        } catch {
          return false;
        }
      },
    });
  });

  group('Tempo Real', () => {
    const res = http.get(`${BASE_URL}/prefeitura/realtime`, {
      headers,
      tags: { name: 'GET /prefeitura/realtime' },
    });
    check(res, {
      'realtime: 200': (r) => r.status === 200,
      'realtime: tem totalClinics': (r) => {
        try {
          return typeof r.json().totalClinics === 'number';
        } catch {
          return false;
        }
      },
    });
  });

  // Think-time entre iterações — reflete o intervalo entre um gestor abrir
  // uma view e clicar na próxima. Sem sleep, o k6 spam da mesma sessão sem
  // realismo e distorce o RPS medido.
  sleep(1);
}

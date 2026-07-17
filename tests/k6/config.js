// Configuração compartilhada dos testes de performance com k6.
//
// Todas as variáveis podem ser sobrescritas via variáveis de ambiente:
//   BASE_URL=https://api.exemplo.com/api k6 run scenarios/smoke.js
//   TEST_EMAIL=other@x.com TEST_PASSWORD=xxx k6 run ...
//
// A autenticação é feita direto no AWS Cognito (o backend não tem mais
// endpoint /auth/login desde a migração da Sprint 2). Configure sempre:
//   COGNITO_REGION      → região do User Pool (padrão us-east-1)
//   COGNITO_CLIENT_ID   → App Client ID do User Pool (obrigatório)

/** Base URL da API. Em Docker Compose local, a API expõe :5000. */
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';

/** Região AWS do Cognito User Pool. */
export const COGNITO_REGION = __ENV.COGNITO_REGION || 'us-east-1';

/** App Client ID do Cognito User Pool. Obrigatório. */
export const COGNITO_CLIENT_ID = __ENV.COGNITO_CLIENT_ID || '';

/** Credenciais do médico de teste seedado pelo DatabaseSeeder. */
export const TEST_USER = {
  email:    __ENV.TEST_EMAIL    || 'medico@plantonhub.com',
  password: __ENV.TEST_PASSWORD || 'Teste@123',
};

/**
 * SLIs padrão que qualquer cenário pode reaproveitar.
 *
 * `http_req_failed` cobre 5xx e falhas de rede.
 * `http_req_duration` mede latência ponta-a-ponta.
 *
 * Ajuste os valores conforme o SLA que você quiser praticar.
 */
export const DEFAULT_THRESHOLDS = {
  // Menos de 1% de requisições podem falhar
  http_req_failed:   ['rate<0.01'],
  // p95 < 500ms, p99 < 1s
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
};

/** Thresholds mais frouxos para stress test (só quero achar o breaking point). */
export const STRESS_THRESHOLDS = {
  http_req_failed:   ['rate<0.10'],
  http_req_duration: ['p(95)<1500', 'p(99)<3000'],
};

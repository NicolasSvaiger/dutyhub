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

/**
 * Seleciona qual usuário de teste usar por padrão. Aceita:
 *   - 'doctor'      → médico (default, TEST_USER)
 *   - 'gestor'      → gestor público da Prefeitura (TEST_USER_PREFEITURA)
 *   - 'admin'       → admin global (TEST_USER_ADMIN, quando necessário)
 * Cenários específicos ainda podem ignorar isso e chamar login(creds) direto.
 */
export const TEST_USER_ROLE = (__ENV.TEST_USER_ROLE || 'doctor').toLowerCase();

/** Credenciais do médico de teste seedado pelo DatabaseSeeder. */
export const TEST_USER_DOCTOR = {
  email:    __ENV.TEST_EMAIL    || 'medico@plantonhub.com',
  password: __ENV.TEST_PASSWORD || 'Teste@123',
};

/**
 * Credenciais do gestor público (Sprint 7A) seedado pelo
 * DatabaseSeeder.SeedGestorPublicoAsync e vinculado à Prefeitura Municipal
 * de Santo André via UserPublicOrganRole. Usado pelos cenários k6 do
 * portal Prefeitura (dashboard, kpis, realtime, etc.).
 */
export const TEST_USER_PREFEITURA = {
  email:    __ENV.TEST_EMAIL_PREFEITURA    || 'gestor@plantonhub.com',
  password: __ENV.TEST_PASSWORD_PREFEITURA || 'Teste@123',
};

/**
 * Credenciais do admin global. Não usado no k6 hoje mas fica exportado pra
 * consistência com fixtures de E2E e testes futuros.
 */
export const TEST_USER_ADMIN = {
  email:    __ENV.TEST_EMAIL_ADMIN    || 'admin@plantonhub.com',
  password: __ENV.TEST_PASSWORD_ADMIN || 'Admin@123',
};

/**
 * Usuário default selecionado pelo TEST_USER_ROLE. Cenários legados que
 * importam `TEST_USER` continuam funcionando (o valor default é o médico).
 */
export const TEST_USER = pickTestUser(TEST_USER_ROLE);

function pickTestUser(role) {
  switch (role) {
    case 'gestor':
    case 'prefeitura':
    case 'gestorpublico':
      return TEST_USER_PREFEITURA;
    case 'admin':
    case 'adminglobal':
      return TEST_USER_ADMIN;
    case 'doctor':
    case 'medico':
    default:
      return TEST_USER_DOCTOR;
  }
}

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

// Smoke test do portal Prefeitura — garante que os endpoints protegidos
// por policy [GestorPublico] respondem sob carga mínima (1 VU, 30s).
// Rodar antes de deploy pra pegar regressões nos filtros por escopo,
// agregação, ou cache warm-up.
//
//   TEST_USER_ROLE=gestor \
//   COGNITO_CLIENT_ID=<id> \
//     k6 run tests/k6/scenarios/prefeitura-smoke.js
//
// Se TEST_USER_ROLE não estiver setado, o setup força o gestor
// explicitamente — este cenário não faz sentido com médico.

import { DEFAULT_THRESHOLDS, TEST_USER_PREFEITURA } from '../config.js';
import { login } from '../lib/auth.js';
import { prefeituraReadFlow } from '../flows/prefeitura-read.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: DEFAULT_THRESHOLDS,
};

export function setup() {
  // Sempre autentica como gestor — o médico não passa nas policies
  // [GestorPublico] e todas as requisições retornariam 403. Passamos as
  // credenciais explicitamente ao invés de confiar no TEST_USER_ROLE
  // pra evitar failure silencioso quando alguém rodar o cenário sem
  // configurar o env var.
  return login(TEST_USER_PREFEITURA);
}

export default function (session) {
  prefeituraReadFlow(session);
}

// Smoke test — verifica que todos os endpoints respondem com sucesso
// sob carga mínima. Rodar antes de fazer deploy para pegar regressões.
//
//   k6 run tests/k6/scenarios/smoke.js

import { DEFAULT_THRESHOLDS } from '../config.js';
import { login } from '../lib/auth.js';
import { doctorReadFlow } from '../flows/doctor-read.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: DEFAULT_THRESHOLDS,
};

/** Setup roda uma vez antes do teste — reutilizamos o token entre iterações. */
export function setup() {
  return login();
}

export default function (session) {
  doctorReadFlow(session);
}

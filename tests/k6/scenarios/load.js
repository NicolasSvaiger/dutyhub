// Load test — simula carga esperada em produção (~30 médicos ativos simultâneos)
// e valida que a p95 fica abaixo de 500ms.
//
//   k6 run tests/k6/scenarios/load.js

import { DEFAULT_THRESHOLDS } from '../config.js';
import { login } from '../lib/auth.js';
import { doctorReadFlow } from '../flows/doctor-read.js';

export const options = {
  stages: [
    { duration: '30s', target: 30 },  // ramp-up
    { duration: '2m',  target: 30 },  // plateau
    { duration: '30s', target: 0 },   // ramp-down
  ],
  thresholds: DEFAULT_THRESHOLDS,
};

export function setup() {
  return login();
}

export default function (session) {
  doctorReadFlow(session);
}

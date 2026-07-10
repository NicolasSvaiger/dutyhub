// Stress test — sobe a carga até o ponto de quebra para descobrir onde a API
// começa a degradar. Thresholds mais frouxos: só falha se a taxa de erro
// passar de 10% ou p95 passar de 1.5s.
//
//   k6 run tests/k6/scenarios/stress.js

import { STRESS_THRESHOLDS } from '../config.js';
import { login } from '../lib/auth.js';
import { doctorReadFlow } from '../flows/doctor-read.js';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m',  target: 100 },
    { duration: '1m',  target: 200 },
    { duration: '2m',  target: 200 },  // segura no pico
    { duration: '30s', target: 0 },
  ],
  thresholds: STRESS_THRESHOLDS,
};

export function setup() {
  return login();
}

export default function (session) {
  doctorReadFlow(session);
}

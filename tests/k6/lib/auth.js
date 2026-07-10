import http from 'k6/http';
import { check, fail } from 'k6';
import encoding from 'k6/encoding';
import { BASE_URL, TEST_USER } from '../config.js';

/**
 * Faz login e retorna { token, refreshToken, clinicIds, clinicId }.
 * Falha o teste imediatamente se as credenciais forem inválidas.
 *
 * @param {{email?: string, password?: string}} [creds] Credenciais opcionais;
 *   se omitido, usa TEST_USER de config.js.
 */
export function login(creds) {
  const { email, password } = creds || TEST_USER;

  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'POST /auth/login' } }
  );

  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: token presente': (r) => !!(r.json() && r.json('token')),
  });

  if (!ok) {
    fail(`Login falhou para ${email}: status=${res.status} body=${res.body}`);
  }

  const token = res.json('token');

  // Decodifica o payload do JWT para extrair as clinicIds autorizadas
  const clinicIds = decodeClinicIds(token);

  return {
    token,
    refreshToken: res.json('refreshToken'),
    clinicIds,
    /** Clínica default (primeira da lista). */
    clinicId: clinicIds[0] || null,
  };
}

/** Extrai o array de clinicIds do payload do JWT (claim `clinicIds`). */
function decodeClinicIds(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return [];
    // Base64URL → string. k6 aceita 'rawstd' para base64url sem padding.
    const json = encoding.b64decode(parts[1], 'rawurl', 's');
    const claims = JSON.parse(json);
    const raw = claims.clinicIds || claims.clinicId || '';
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

/** Constrói o header de auth para as demais requisições. */
export function authHeaders(session, extraHeaders) {
  const headers = {
    Authorization: `Bearer ${session.token}`,
    'Content-Type': 'application/json',
  };
  if (session.clinicId) {
    headers['X-Clinic-Id'] = session.clinicId;
  }
  return Object.assign(headers, extraHeaders || {});
}

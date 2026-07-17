import http from 'k6/http';
import { check, fail } from 'k6';
import encoding from 'k6/encoding';
import { COGNITO_CLIENT_ID, COGNITO_REGION, TEST_USER } from '../config.js';

/**
 * Autentica um usuário direto no AWS Cognito (USER_PASSWORD_AUTH) e retorna
 * uma "session" reutilizável: { token, refreshToken, clinicIds, clinicId }.
 *
 * O legado deste projeto tinha `POST /auth/login` no backend, removido na
 * Sprint 2 quando a autenticação foi migrada para Cognito. O k6 agora fala
 * direto com o Cognito, exatamente como o frontend faz via
 * amazon-cognito-identity-js — assim o teste exercita o mesmo caminho de
 * validação de token que a API vê em produção.
 *
 * @param {{email?: string, password?: string}} [creds] Credenciais opcionais;
 *   se omitido, usa TEST_USER de config.js.
 */
export function login(creds) {
  const { email, password } = creds || TEST_USER;

  if (!COGNITO_CLIENT_ID) {
    fail(
      'COGNITO_CLIENT_ID não configurado. Defina via env var ou secret do workflow.',
    );
  }

  const res = http.post(
    `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
    JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
    {
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      tags: { name: 'POST cognito/InitiateAuth' },
    },
  );

  const ok = check(res, {
    'cognito login: status 200': (r) => r.status === 200,
    'cognito login: token presente': (r) => {
      const body = r.json();
      return !!(body && body.AuthenticationResult && body.AuthenticationResult.IdToken);
    },
  });

  if (!ok) {
    fail(`Login Cognito falhou para ${email}: status=${res.status} body=${res.body}`);
  }

  const auth = res.json().AuthenticationResult;
  const token = auth.IdToken;
  const clinicIds = decodeClinicIds(token);

  return {
    token,
    refreshToken: auth.RefreshToken,
    clinicIds,
    /** Clínica default (primeira da lista); pode ser null se o Lambda pre-token
     *  não injetou o claim. Nesse caso o TenantMiddleware faz fallback via DB. */
    clinicId: clinicIds[0] || null,
  };
}

/**
 * Extrai o array de clinicIds do payload do ID Token do Cognito.
 * O claim é injetado pela Lambda pre-token-generation e pode vir como JSON
 * array (`["uuid1","uuid2"]`), CSV (`uuid1,uuid2`) ou ausente.
 */
function decodeClinicIds(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return [];
    const json = encoding.b64decode(parts[1], 'rawurl', 's');
    const claims = JSON.parse(json);
    const raw = claims.clinicIds || claims.clinicId || '';
    const asString = String(raw).trim();

    if (asString.startsWith('[')) {
      try {
        const parsed = JSON.parse(asString);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        // cai para o parser CSV abaixo
      }
    }

    return asString
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
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

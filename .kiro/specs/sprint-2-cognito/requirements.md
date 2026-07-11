# Sprint 2 — Migração Auth → Cognito

**Deadline:** 13/07/2026
**Esforço:** 3-4 dias
**Dependência:** Sprint 1 ✅

---

## Objetivo

Substituir o auth caseiro (JWT gerado pelo backend, senha bcrypt no banco) pelo AWS Cognito. O profissional ganha reset de senha, MFA e proteção contra brute force de graça. O backend para de ser responsável por gerenciar credenciais.

---

## Requisitos

### 1. Backend — Dual-mode Auth

- [ ] 1.1 Adicionar middleware JWT que aceita tokens do Cognito (segundo issuer válido)
- [ ] 1.2 Configurar `TokenValidationParameters` com Cognito User Pool ID + região
- [ ] 1.3 TenantService: ler claims do formato Cognito (`cognito:groups` → roles, `custom:clinicIds` → clinicIds)
- [ ] 1.4 Variável de ambiente `AUTH_ISSUER` pra alternar entre local e Cognito
- [ ] 1.5 Manter `/api/auth/login` local funcionando pra dev (feature flag)

### 2. Cognito — Configuração

- [ ] 2.1 Criar User Pool via CDK (ou console) com email como username
- [ ] 2.2 Password policy: min 8 chars, upper + lower + number + special
- [ ] 2.3 App Client: SPA (public client, sem secret, PKCE)
- [ ] 2.4 Criar Groups: AdminGlobal, AdminClinica, Medico, Enfermeiro, Tecnico
- [ ] 2.5 Custom attributes: `custom:clinicIds` (string, comma-separated GUIDs)
- [ ] 2.6 Pre-token-generation Lambda (ou trigger): injeta `clinicIds` no token
- [ ] 2.7 Configurar email de verificação + reset de senha (SES ou Cognito default)
- [ ] 2.8 Domínio do Cognito (hosted UI): `auth.laulab.com.br` ou prefix default

### 3. Migração de Usuários

- [ ] 3.1 Script que lê Users do RDS e cria no Cognito via AdminCreateUser
- [ ] 3.2 Atribuir groups corretos baseado na tabela UserClinicRoles
- [ ] 3.3 Setar `custom:clinicIds` attribute por usuário
- [ ] 3.4 Usuários recebem email com senha temporária (force change on first login)
- [ ] 3.5 Manter tabela Users no RDS como referência de dados de negócio (não deletar)

### 4. Frontend — Login via Cognito

- [ ] 4.1 Instalar `@aws-amplify/auth` ou `amazon-cognito-identity-js`
- [ ] 4.2 Configurar Amplify com User Pool ID + App Client ID
- [ ] 4.3 Reescrever `AuthContext.tsx` pra usar Cognito SDK (signIn, signOut, getCurrentUser)
- [ ] 4.4 Reset de senha: tela "Esqueci minha senha" que chama `forgotPassword` + `confirmForgotPassword`
- [ ] 4.5 Primeiro login: tela de "Force change password" (Cognito exige)
- [ ] 4.6 Token refresh automático via Amplify (substituir interceptor manual)
- [ ] 4.7 Manter `axiosInstance` usando o token do Cognito no header Authorization
- [ ] 4.8 `getHomeRouteFor(roles)` continua funcionando (lê roles do token Cognito)

### 5. Testes

- [ ] 5.1 Adaptar E2E (Playwright) pro fluxo de login Cognito
- [ ] 5.2 Unit tests do TenantService com claims no formato Cognito
- [ ] 5.3 Integration test: criar user no Cognito → login → chamar endpoint protegido
- [ ] 5.4 Vitest: AuthContext com mock do Amplify

### 6. Cleanup (após validação)

- [ ] 6.1 Remover `JwtTokenService` (geração de token próprio)
- [ ] 6.2 Remover `POST /api/auth/login` e `POST /api/auth/refresh-token`
- [ ] 6.3 Remover campo `PasswordHash` da entidade User (ou ignorar)
- [ ] 6.4 Atualizar Dockerfile/env vars pra não mais precisar de JWT_SECRET local

---

## Configuração CDK (adição ao stack existente)

```typescript
const userPool = new cognito.UserPool(this, 'UserPool24p7', {
  userPoolName: '24p7-users',
  selfSignUpEnabled: false, // admin cria os users
  signInAliases: { email: true },
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireDigits: true,
    requireSymbols: true,
  },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  customAttributes: {
    clinicIds: new cognito.StringAttribute({ mutable: true }),
  },
});
```

---

## Prompt pra próxima sessão

> "Sprint 2 — Migrar auth pro Cognito. Spec em .kiro/specs/sprint-2-cognito/requirements.md. O backend já roda em api.laulab.com.br (App Runner) e o frontend em app.laulab.com.br (CloudFront+S3). Começa pela configuração do User Pool e dual-mode auth no backend."

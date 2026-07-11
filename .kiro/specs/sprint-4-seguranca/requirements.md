# Sprint 4 — Segurança & Hardening

**Deadline:** 17/07/2026
**Esforço:** 1 dia
**Dependência:** Nenhuma (pode rodar paralelo)

---

## Objetivo

Fechar brechas de segurança antes de ir pra produção real. Rate limiting, headers, validação de input, CORS correto.

---

## Requisitos

### 1. Rate Limiting

- [ ] 1.1 Rate limit no `/api/auth/login`: max 5 tentativas/minuto por IP
- [ ] 1.2 Rate limit no `/api/attendance/check-in`: max 10/minuto por user
- [ ] 1.3 Implementar via middleware .NET (`AspNetCoreRateLimit`) ou AWS WAF
- [ ] 1.4 Retornar 429 Too Many Requests com header `Retry-After`

### 2. Headers de Segurança

- [ ] 2.1 `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS)
- [ ] 2.2 `X-Content-Type-Options: nosniff`
- [ ] 2.3 `X-Frame-Options: DENY`
- [ ] 2.4 `Content-Security-Policy` (CSP) básico
- [ ] 2.5 `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] 2.6 Remover `Server` header (não expor ASP.NET/Kestrel)

### 3. Validação de Input (FluentValidation)

- [ ] 3.1 `CheckInRequestValidator`: latitude [-90,90], longitude [-180,180], deviceId não-vazio, shiftId GUID válido
- [ ] 3.2 `CheckOutRequestValidator`: mesmos campos
- [ ] 3.3 `LoginRequestValidator`: email válido, senha min 8 chars
- [ ] 3.4 Registrar validators no DI (AddValidatorsFromAssembly)
- [ ] 3.5 Pipeline behavior que valida antes de chegar no service

### 4. CORS

- [ ] 4.1 Permitir apenas origins conhecidos: `app.laulab.com.br`, `localhost:3000`
- [ ] 4.2 Bloquear wildcard `*` em produção
- [ ] 4.3 Expor headers necessários: `Authorization`, `X-Clinic-Id`

### 5. Refresh Token Rotation (se ainda tiver auth local como fallback)

- [ ] 5.1 A cada uso do refresh token, gerar novo e invalidar o anterior
- [ ] 5.2 Se refresh token já usado for apresentado novamente → revogar todos os tokens da sessão (possível leak)

### 6. Testes

- [ ] 6.1 Integration test: rate limit retorna 429 após 6 tentativas
- [ ] 6.2 Integration test: request sem CORS válido retorna 403
- [ ] 6.3 Unit test: validators rejeitam input inválido
- [ ] 6.4 E2E: verificar headers de segurança na response

---

## Prompt pra próxima sessão

> "Sprint 4 — Segurança. Spec em .kiro/specs/sprint-4-seguranca/requirements.md. App já está em produção (app.laulab.com.br). Implementar rate limiting, headers de segurança, FluentValidation e CORS correto."

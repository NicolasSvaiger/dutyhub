# 24p7 — Roadmap & Planejamento de Sprints

**Data:** 10/07/2026  
**Versão atual:** v0.1 (local funcionando, 426 testes passando)  
**Infra:** Sprint 1 concluído (AWS App Runner + RDS + Cognito + CI)

---

## Visão Geral do Produto

Sistema de gestão de presença para profissionais de saúde (médicos, enfermeiros, técnicos) em clínicas/UPAs. Check-in/check-out com geolocalização, relatórios, suporte offline, multi-clínica.

**3 áreas do sistema:**
1. **Profissional** (médico/enfermeiro/técnico) — ✅ v0.1 pronta
2. **Admin OS** (gestora/organizadora social) — 🔲 a fazer
3. **Órgão Público** (prefeitura/fiscalização) — 🔲 a fazer

---

## Estado Atual (v0.1)

### O que já funciona:
- Login com email/senha (design novo, dark/light mode, i18n pt/en/es)
- Área do profissional completa:
  - Check-in/check-out com geolocalização
  - Modal unificado com endpoint `/attendance/status`
  - Tela de presença (último check-in + check-out)
  - Plantões (hoje/próximos/passados com "Ver mais")
  - Relatórios (filtro por data/clínica, badges, resumo)
  - Ajustes (tema, idioma, logout)
  - Notificações (bell + popover)
- Multi-clínica (profissional vê todas as clínicas autorizadas)
- Suporte offline (fila de sync, cache local, retry)
- Anti-fraude básico (geofence, device check, biometric flag)
- Dark mode + Light mode
- 3 idiomas (PT, EN, ES)
- Marca configurável (`brand.ts` → "24p7")
- API: .NET 8, PostgreSQL, Redis cache, JWT auth
- Docker Compose (dev local)
- 426 testes automatizados (unit, property, integration, component, E2E)

### O que falta pra produção:
- Auth robusto (Cognito) — sem reset de senha, sem MFA
- Biometria (validação de identidade no check-in)
- Dashboard Admin OS (gestão de profissionais, escalas, contratos)
- Painel Órgão Público (fiscalização, KPIs)
- PWA (installable no celular)
- Observabilidade (logs estruturados, métricas)

---

## Sprints Planejados

### Sprint 2 — Migração Auth → Cognito (CRÍTICO)
**Prioridade:** 🔴 Alta  
**Esforço:** 2-3 dias  
**Bloqueado por:** Sprint 1 ✅  
**Bloqueia:** Sprint 3, 5, 6

| Item | Descrição |
|------|-----------|
| Frontend login via Cognito SDK | Substituir login próprio pelo Cognito hosted UI ou custom |
| Migrar usuários | Script AdminCreateUser pra cada profissional existente |
| Reset de senha | Cognito resolve (fluxo de email automático) |
| MFA | Cognito resolve (TOTP, email OTP) |
| Remover auth caseiro | Deletar JwtTokenService, AuthController.Login |
| Adaptar testes E2E | Login via Cognito no Playwright |

**Por que é crítico:** Sem isso, estamos em produção com senha bcrypt no banco, sem reset, sem MFA, sem proteção contra brute force. Risco de segurança real.

---

### Sprint 3 — Biometria
**Prioridade:** 🟡 Média  
**Esforço:** 1-3 dias  
**Bloqueado por:** Sprint 2

| Item | Descrição |
|------|-----------|
| WebAuthn como MFA no Cognito | Fingerprint/Face ID do device |
| UI: step de biometria no modal | Oval + animação do mock original |
| Backend: claim `amr:webauthn` | Seta `biometricValidated` automaticamente |
| Face Recognition local (opcional) | face-api.js — cadastro + validação client-side |

**Opções de custo:**
- WebAuthn (device): R$ 0/mês, 2-3h de dev
- Face local (TF.js): R$ 0/mês, 2-3 dias de dev
- Face cloud (Azure/AWS): ~R$ 12-24/mês (200 profissionais)

---

### Sprint 4 — Segurança & Hardening
**Prioridade:** 🟡 Média (pode rodar paralelo)  
**Esforço:** 1 dia

| Item | Descrição |
|------|-----------|
| Rate limiting no login | WAF ou middleware |
| HTTPS em dev (mkcert) | Necessário pra WebAuthn |
| FluentValidation nos requests | Validação explícita antes do service |
| Headers de segurança | CSP, HSTS, X-Frame-Options |
| Refresh token rotation | Proteção contra token leak |

---

### Sprint 5 — PWA & UX Mobile
**Prioridade:** 🟡 Média  
**Esforço:** 1-2 dias  
**Bloqueado por:** Sprint 2 (precisa de staging funcionando)

| Item | Descrição |
|------|-----------|
| PWA manifest + service worker | App installable no celular |
| Push notifications | Lembrete de plantão 30min antes |
| Code-splitting (lazy routes) | Bundle menor, load mais rápido |
| Offline sync melhorado | UI visual da fila + retry feedback |

**Impacto:** Profissional instala no celular como app nativo. UX mobile melhora 10x.

---

### Sprint 6 — Dashboard Admin OS (GRANDE)
**Prioridade:** 🟢 Próximo milestone  
**Esforço:** 1-2 semanas  
**Bloqueado por:** Sprint 2

| Tela (do mock original) | Descrição |
|------|-----------|
| admin-welcome | Dashboard de boas-vindas com KPIs |
| admin-medicos | CRUD de profissionais + vínculo clínica |
| admin-escalas | Criar/editar plantões e escalas |
| admin-upas | Gestão de UPAs/clínicas |
| admin-tempo-real | Monitor de presença em tempo real |
| admin-faturamento | Horas trabalhadas × valor, por contrato |
| admin-gerencial | Gráficos de evolução, ocupação |
| admin-disponibilidade | Disponibilidade dos profissionais |
| admin-substituicoes | Gestão de trocas de plantão |
| admin-justificativas | Faltas e justificativas |
| admin-auditoria | Log de operações |
| admin-alertas | Notificações e alertas do sistema |
| admin-configuracoes | Configurações do sistema |
| admin-gestores | CRUD de gestores |
| admin-orgaos | Gestão de órgãos públicos vinculados |
| admin-usuarios | Gestão de todos os usuários |
| admin-login | Login do admin (usa mesmo Cognito) |

**Referência:** Mocks HTML em `frontend/public/originais/OS/`

---

### Sprint 7 — Painel Órgão Público
**Prioridade:** 🟢 Futuro  
**Esforço:** 1 semana

| Tela (do mock original) | Descrição |
|------|-----------|
| op-welcome | Dashboard de boas-vindas |
| op-frequencia | Frequência dos profissionais por UPA |
| op-escalas | Visualização das escalas (read-only) |
| op-kpis | Indicadores de desempenho |
| op-realtime | Monitor em tempo real |
| op-historico | Histórico de presença |
| op-atrasos | Relatório de atrasos |
| op-ausencias | Relatório de ausências |
| op-tv | Modo TV (dashboard em tela grande) |
| op-login | Login do órgão público |

**Referência:** Mocks HTML em `frontend/public/originais/Prefeitura/`

---

### Sprint 8 — Observabilidade & Escala
**Prioridade:** 🟢 Antes de prod real  
**Esforço:** 1-2 dias

| Item | Descrição |
|------|-----------|
| Serilog estruturado + CloudWatch | Logs com correlação de request |
| Health checks detalhados | DB, Redis, Cognito |
| CQRS leve | Separar queries de commands |
| Auto-scaling | App Runner config (min/max instances) |
| Migração ECS Fargate | Quando >500 profissionais |

---

## Custo de Infra por Fase

| Fase | Profissionais | Custo/mês |
|------|---------------|-----------|
| MVP (agora) | 1-200 | ~$13 (free tier) |
| Crescimento | 200-2.000 | ~$210-250 |
| Escala | 2.000-10.000 | ~$630-700 |

**Crédito AWS disponível:** $120 → cobre ~9 meses no MVP.

---

## Timeline Estimada

```
Jul 2026    ████████ Sprint 1 (Infra) ✅
            ████████ Sprint 2 (Cognito) ← próximo
            ████ Sprint 3 (Biometria)
            ██ Sprint 4 (Segurança)

Ago 2026    ████ Sprint 5 (PWA)
            ████████████████ Sprint 6 (Admin OS)

Set 2026    ████████ Sprint 7 (Órgão Público)
            ████ Sprint 8 (Observabilidade)
            🚀 PRODUÇÃO COMPLETA
```

---

## Decisões Pendentes (pra reunião)

1. **Biometria:** WebAuthn (device) é suficiente ou precisa de face recognition real? Depende de requisito da prefeitura.

2. **Admin OS:** priorizar quais telas primeiro? Sugestão: profissionais + escalas + tempo-real (core operacional).

3. **Órgão Público:** é MVP ou pode ficar pra v2? Se puder adiar, foca no admin OS primeiro.

4. **Domínio:** `24p7.laulab.com` confirmado. API fica em `api.24p7.laulab.com`?

5. **Subdomínios por área:**
   - `24p7.laulab.com` → profissional
   - `admin.24p7.laulab.com` → admin OS
   - `gov.24p7.laulab.com` → órgão público
   - Ou tudo no mesmo domínio com rotas? (`/admin`, `/gov`)

6. **Usuários iniciais:** quantos profissionais vão usar na primeira semana? Precisa de onboarding em massa?

7. **Contrato com prefeitura:** tem SLA de uptime? Exige certificação de segurança? Isso muda a prioridade do Sprint 8.

---

## Arquivos de Referência no Repo

| Path | O que contém |
|------|--------------|
| `.kiro/specs/sprint-1-infra-aws/requirements.md` | Spec do Sprint 1 (✅ concluído) |
| `docs/reuniao-integracao-24p7.md` | Contrato de API, mapeamento de rotas (prontas vs criar), decisões arquiteturais, integração Flutter |
| `frontend/public/originais/Medico/medicos.html` | Mock médico (base do v0.1) |
| `frontend/public/originais/OS/admin-*.html` | Mocks admin OS (Sprint 6) |
| `frontend/public/originais/Prefeitura/op-*.html` | Mocks órgão público (Sprint 7) |
| `frontend/src/config/brand.ts` | Marca configurável ("24p7") |
| `frontend/src/config/roles.ts` | Roles dos profissionais |
| `infrastructure/` | CDK Stack (Sprint 1) |

---

## API — Mapeamento de Endpoints (ref: `docs/reuniao-integracao-24p7.md`)

### Prontos para usar (5 endpoints)

| Endpoint | Descrição |
|----------|-----------|
| `POST /api/auth/login` | Login email + senha → JWT + refresh token |
| `POST /api/auth/logout` | Blacklist do JWT |
| `POST /api/auth/refresh-token` | Renova token expirado |
| `GET /api/attendance/status` | Estado unificado (canCheckIn, canCheckOut, shifts, active) |
| `POST /api/attendance/check-in` | Registra entrada (geo + shift + biometric flag) |
| `POST /api/attendance/check-out` | Registra saída |
| `GET /api/attendance/my-history` | Histórico cross-clinic |
| `GET /api/attendance/active` | Check-ins abertos |
| `POST /api/attendance/sync` | Sync batch offline events |
| `GET /api/clinics` | Lista clínicas autorizadas |
| `GET /api/shifts/me` | Todos os plantões do profissional |
| `GET /api/shifts/me/today` | Plantões de hoje |

### Precisam de adaptação (3 endpoints)

| Endpoint | O que adaptar |
|----------|---------------|
| `GET /api/users/me` | Criar — hoje precisa de ID na URL |
| `GET /api/clinics` | Mapear campos pro formato do app Flutter |
| `GET /api/attendance/my-history` | Adicionar filtros `from`, `to`, paginação |

### Precisam ser criados (4 endpoints)

| Endpoint | Complexidade | Descrição |
|----------|--------------|-----------|
| `POST /api/auth/biometric` | Alta | Auth por biometria facial |
| `GET /api/auth/session` | Baixa | Validar token (retorna user ou 401) |
| `GET /api/clinics/nearest` | Média | Clínica mais próxima por lat/lng |
| `GET /api/attendance/summary` | Média | Agregação: dias, horas, ausências |

### Decisão pendente: Check-in por UPA vs por Plantão

| Opção | Descrição | Recomendação |
|-------|-----------|--------------|
| A. Walk-in livre | Cria plantão automático, médico não precisa ter agendamento | Simples |
| B. Plantão obrigatório | Admin agenda antes, médico vincula ao shift | Controle total |
| **C. Híbrido** | Se tem plantão agendado: vincula. Se não: cria walk-in. | **Recomendado** |

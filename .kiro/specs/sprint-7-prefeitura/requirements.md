# Sprint 7 — Portal Prefeitura

**Deadline:** a definir
**Esforço estimado:** 10-13 dias corridos (paralelizando backend + frontend)
**Dependência:** Sprint 2 (Cognito), Sprint 6 (Admin OS — CRUD de PublicOrgan já existe)

---

## Contexto

Já temos no sistema:

- `PublicOrgan` (entidade) — modela prefeitura / secretaria / subprefeitura, com hierarquia parent/child.
- `Contract` — linka `PublicOrgan → Clinics` (uma prefeitura contrata a OS pra gerir N unidades).
- `AdminOrgaos.tsx` — Admin OS já faz CRUD de PublicOrgan e contratos.

O que falta é a **visão do gestor público** — o portal onde o representante da prefeitura consulta escalas, frequência, atrasos, ausências, histórico e monitor ao vivo das UPAs que ele contratou. Puramente read-only, com foco em transparência e fiscalização.

Os mocks HTML já existem em `frontend/public/originais/Prefeitura/` (10 telas: `op-login`, `op-welcome`, `op-kpis`, `op-escalas`, `op-frequencia`, `op-atrasos`, `op-ausencias`, `op-historico`, `op-realtime`, `op-tv`).

## Objetivo

Entregar o portal Prefeitura permitindo que um `GestorPublico` autenticado via Cognito acesse:

1. Um dashboard consolidado (KPIs + resumo do dia)
2. Consulta de escalas planejadas (read-only)
3. Relatórios de frequência, atrasos e ausências dos profissionais nas UPAs contratadas
4. Histórico consolidado de operações
5. Monitor ao vivo das UPAs (equivalente ao AdminTempoReal, filtrado)
6. Modo TV — display fullscreen para monitoramento contínuo

Todos os dados filtrados por escopo: `PublicOrgan` do gestor logado + subprefeituras descendentes (via `Parent`/`Children` já modelados).

## Requisitos

### 1. Autenticação e autorização

- [ ] 1.1 Novo `RoleType.GestorPublico = 6`
- [ ] 1.2 Nova entity `UserPublicOrganRole` (junction User ↔ PublicOrgan)
- [ ] 1.3 Novo grupo Cognito `GestorPublico` no User Pool
- [ ] 1.4 Lambda pre-token-generation injeta claim `publicOrganId` para usuários do grupo `GestorPublico`
- [ ] 1.5 Nova policy `GestorPublico` no `AddAuthorizationPolicies`
- [ ] 1.6 `ITenantService.GetCurrentPublicOrganId()` — lê do `HttpContext.Items` (setado pelo `TenantMiddleware`)
- [ ] 1.7 `TenantMiddleware` resolve `publicOrganId` do JWT ou fallback via `UserPublicOrganRoleRepository` (mesmo padrão da Sprint B para `clinicIds`)
- [ ] 1.8 Login usa a mesma tela Cognito, mas com layout diferenciado (`PrefeituraLoginPage`) e redirect para `/prefeitura` após sucesso
- [ ] 1.9 Gestor de organ raiz enxerga descendentes recursivamente; gestor de organ filho enxerga só o próprio

### 2. Endpoints backend (read-only)

- [ ] 2.1 `GET /api/prefeitura/dashboard` — KPIs consolidados: profissionais ativos hoje, taxa de presença mês, ausências pendentes, contratos ativos
- [ ] 2.2 `GET /api/prefeitura/kpis?from={iso}&to={iso}` — KPIs detalhados por período (agregação por clínica e por tipo profissional)
- [ ] 2.3 `GET /api/prefeitura/clinics` — UPAs cobertas pelos contratos ativos do organ
- [ ] 2.4 `GET /api/prefeitura/shifts?from&to&clinicId?` — escalas planejadas no período (read-only, sem edição)
- [ ] 2.5 `GET /api/prefeitura/frequency?from&to&clinicId?` — presença consolidada: previsto vs realizado por dia/turno
- [ ] 2.6 `GET /api/prefeitura/absences?from&to&type?` — ausências e atrasos (com filtro por tipo: `Absence`, `Late`)
- [ ] 2.7 `GET /api/prefeitura/history?from&to&type?&search?&page&pageSize` — histórico paginado de eventos (check-in/check-out, ausências, justificativas)
- [ ] 2.8 `GET /api/prefeitura/realtime` — snapshot em tempo real: quem está em plantão agora, atrasos abertos, alertas críticos

### 3. Filtro por organ (autorização de dados)

- [ ] 3.1 Todos os endpoints acima filtram por `_tenantService.GetCurrentPublicOrganId()`
- [ ] 3.2 Se o organ é raiz, agregar dados de todos os descendentes recursivamente (via SQL CTE ou lookup do repo)
- [ ] 3.3 Nenhum endpoint aceita `PublicOrganId` como parâmetro — a autorização é implícita pelo token
- [ ] 3.4 Se o usuário perdeu o role `GestorPublico` (revogado), todas as chamadas retornam 403

### 4. Frontend — layout e navegação

- [ ] 4.1 Rota `/prefeitura/login` — tela de login isolada (layout split: hero + form)
- [ ] 4.2 Rota `/prefeitura` — layout com sidebar (state-based navigation, mesmo padrão do `AdminPage`)
- [ ] 4.3 Rota `/prefeitura/tv` — modo TV fullscreen (dark theme, sem sidebar, auto-refresh via polling)
- [ ] 4.4 `ProtectedRoute` com `requiredRoles=['GestorPublico']` bloqueia acesso não autorizado
- [ ] 4.5 `AppLayout` esconde o header top em `/prefeitura*` (mesmo padrão do `/admin*`)
- [ ] 4.6 `AdminLoginPage.useEffect` (redirect por role) precisa distinguir `AdminGlobal/AdminClinica` (vai pra `/admin`) de `GestorPublico` (vai pra `/prefeitura`)
- [ ] 4.7 Login profissional em `/login` — se um gestor tentar logar aí, redireciona pra `/prefeitura`

### 5. Frontend — telas

Uma tela por mock:

- [ ] 5.1 `PrefeituraLoginPage.tsx` — usa `op-login.html`. Login Cognito, MFA opcional, redirect por role.
- [ ] 5.2 `PrefeituraWelcome.tsx` — usa `op-welcome.html`. Home com saudação, KPIs principais, resumo do dia, últimos alertas.
- [ ] 5.3 `PrefeituraKpis.tsx` — usa `op-kpis.html`. Cards com métricas filtráveis por período. Grid de barras/percentuais.
- [ ] 5.4 `PrefeituraEscalas.tsx` — usa `op-escalas.html`. Grade semanal (turno × dia) read-only, filtro por UPA.
- [ ] 5.5 `PrefeituraFrequencia.tsx` — usa `op-frequencia.html`. Tabela previsto vs realizado + filtros de data/UPA/profissional.
- [ ] 5.6 `PrefeituraAtrasos.tsx` — usa `op-atrasos.html`. Lista de atrasos com detalhes e filtros.
- [ ] 5.7 `PrefeituraAusencias.tsx` — usa `op-ausencias.html`. Lista de ausências com destaque para atenção (alerta cabeçalho).
- [ ] 5.8 `PrefeituraHistorico.tsx` — usa `op-historico.html`. Timeline + visão tabela (toggle), paginação, filtros.
- [ ] 5.9 `PrefeituraRealtime.tsx` — usa `op-realtime.html`. Monitor ao vivo similar a `AdminTempoReal`. Polling 15s.
- [ ] 5.10 `PrefeituraTvMode.tsx` — usa `op-tv.html`. Fullscreen dark, sem sidebar, polling 10s, dados críticos em destaque.

### 6. Auth do Modo TV

- [ ] 6.1 Login inicial na tela `/prefeitura/tv` requer credencial (uma vez)
- [ ] 6.2 Refresh token Cognito armazenado no localStorage do device
- [ ] 6.3 Reautenticação automática antes de token expirar (refresh 5min antes)
- [ ] 6.4 Sem interação humana requerida após o setup inicial

### 7. i18n

- [ ] 7.1 Todas as strings visíveis em `i18n/locales/pt.json` sob namespace `prefeitura.*`
- [ ] 7.2 Traduções `en.json` e `es.json` completas para paridade

### 8. Testes

#### Backend
- [ ] 8.1 Unit tests para `PrefeituraService` (~30 testes cobrindo os 8 endpoints, permissão, agregações, hierarquia)
- [ ] 8.2 Unit tests para `TenantService.GetCurrentPublicOrganId` e `CanAccessPublicOrgan` (~8 testes)
- [ ] 8.3 Unit tests para `TenantMiddleware` — claim `publicOrganId` + fallback DB (~5 testes)
- [ ] 8.4 Unit tests para policy `GestorPublico` (~4 testes)
- [ ] 8.5 Property tests:
  - **Propriedade 1:** Isolamento por organ — nunca vaza dados de outro `PublicOrganId`
  - **Propriedade 2:** Hierarquia — gestor de organ raiz vê união de si + descendentes; gestor de child vê apenas o child
  - **Propriedade 3:** Agregações de KPI são idempotentes (mesmos inputs → mesmos outputs)
- [ ] 8.6 Integration tests (Testcontainers + Cognito real, ~10 testes):
  - Login como GestorPublico → dashboard retorna dados
  - Gestor sem contrato → dados vazios (sem 500, sem 403 — retorna estruturas vazias)
  - Gestor tenta acessar `/api/admin/*` → 403
  - Realtime cross-clinic com contratos em múltiplas UPAs
  - Fallback middleware quando JWT sem claim

#### Frontend
- [ ] 8.7 Vitest — 12 arquivos de teste (um por página + api + hooks), ~215 testes total
- [ ] 8.8 Playwright — `prefeitura-flows.spec.ts` (7 smokes) + `prefeitura-tv.spec.ts` (3 testes de auto-refresh)

#### Performance
- [ ] 8.9 k6 — novo scenario `prefeitura-smoke.js` (30s, 1 VU) + flow `prefeitura-read.js`
- [ ] 8.10 Workflow `perf.yml` inclui `prefeitura-smoke.js` no dropdown

### 9. Documentação

- [ ] 9.1 `README.md` (raiz) — nova seção "Portal Prefeitura", rota `/prefeitura`, credencial de teste
- [ ] 9.2 `frontend/README.md` — nova linha na tabela de rotas com `requiredRoles=['GestorPublico']`
- [ ] 9.3 `docs/portal-prefeitura.md` (novo) — guia funcional das 10 telas + modelo de auth + hierarquia + TV mode

## Requisitos não funcionais

### Performance

- p95 dos endpoints do gestor < 500ms (mesmo threshold do médico)
- Dashboard e realtime cacheados no Redis com TTL 30s (dados agregados aceitam staleness curta)
- Histórico paginado (padrão 30 items) — não retorna >1000 rows em uma request

### Segurança

- Nenhum endpoint aceita `PublicOrganId` como parâmetro — sempre pelo token
- Rate limits reutilizando as policies existentes (Session, Logout)
- Audit log para todas as ações do gestor (leitura de relatórios sensíveis também é auditada)
- TV mode não expõe endpoints públicos — sempre autenticado

### Ausência de escrita

- Prefeitura é **read-only end-to-end**. Nenhum endpoint permite mutação.
- Justificativas, aprovações e correções continuam sendo responsabilidade do Admin OS.

## Aceite

Ao final da sprint, um usuário do grupo `GestorPublico` no Cognito deve conseguir:

1. Acessar `/prefeitura/login`, autenticar e ser redirecionado para `/prefeitura`
2. Ver os KPIs consolidados do dia com dados reais (do próprio organ + descendentes)
3. Navegar entre as 8 sub-views via sidebar sem que a URL mude (state-based)
4. Consultar escalas, frequência, atrasos, ausências e histórico com filtros de data/UPA funcionais
5. Ver o monitor ao vivo atualizando via polling
6. Ativar o modo TV (`/prefeitura/tv`) em um display e deixá-lo rodando por horas sem intervenção
7. Ser bloqueado (403) se tentar acessar rotas do Admin OS (`/api/admin/*`)
8. Aparecer em `AuditLogs` todas as leituras auditáveis

Prompt para próxima sessão:

> "Sprint 7 — Portal Prefeitura. Specs em `.kiro/specs/sprint-7-prefeitura/`. Começa pela Sprint 7A (foundation: RoleType.GestorPublico + UserPublicOrganRole entity + policy + Cognito Lambda claim `publicOrganId`)."

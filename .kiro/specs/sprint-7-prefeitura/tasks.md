# Implementation Plan: Sprint 7 Prefeitura

## Overview

4 sprints incrementais (7A → 7D). Cada sprint termina com commit verde
no CI, sem misturar concerns. 7A é foundation e pode ficar dormente
até 7B; 7B expõe os endpoints mas sem UI; 7C entrega a UI; 7D fecha
com testes E2E e docs.

Estimativa: **12-15 dias corridos** paralelizando 7C com o final da 7B
(era 10-13 antes de incluir Acionar OS + Exportação PDF/Excel).

## Task Dependency Graph.

```
Sprint 7A (foundation) ─┐
                        ├─► Sprint 7B (backend) ──┐
                        │                         │
                        └──────────► Sprint 7C ───┼─► Sprint 7D (polish)
                                     (frontend)   │
                                                  │
Sprint 7C pode iniciar em paralelo assim que 7A verde e o modelo de
auth + policy estiver em produção. Sprint 7B pode ir em paralelo
com 7C após os primeiros 2-3 endpoints backend estarem prontos
(o frontend faz mocks temporários enquanto endpoints reais chegam).

Sprint 7D depende de 7C mergeada (E2E precisa de UI).
```

## Tasks

## Sprint 7A — Foundation (auth model + Cognito)

Fundação que não impacta usuário final. Mergeável isolado.

- [ ] 1. Domain — nova entity e enum
  - [ ] 1.1 Adicionar `GestorPublico = 6` em `src/PlantonHub.Domain/Enums/RoleType.cs`
    - _Requisitos: 1.1_
  - [ ] 1.2 Criar `src/PlantonHub.Domain/Entities/UserPublicOrganRole.cs`
    - Campos: `Id`, `UserId`, `User` (nav), `PublicOrganId`, `PublicOrgan` (nav), `Role` (enum), `AssignedAt`
    - _Requisitos: 1.2_
  - [ ] 1.3 Criar `src/PlantonHub.Domain/Interfaces/IUserPublicOrganRoleRepository.cs`
    - Métodos: `GetByUserIdAsync(Guid)`, `GetByOrganIdAsync(Guid)`, `AddAsync(entity)`, `RemoveAsync(entity)`
    - _Requisitos: 1.7_

- [ ] 2. Infrastructure — persistence + configuração
  - [ ] 2.1 Criar `src/PlantonHub.Infrastructure/Data/Configurations/UserPublicOrganRoleConfiguration.cs`
    - Unique constraint composto `(UserId, PublicOrganId)`
    - Cascade delete em `User` e `PublicOrgan`
    - Índice em `PublicOrganId` para queries reversas
    - _Requisitos: 1.2_
  - [ ] 2.2 Criar `src/PlantonHub.Infrastructure/Repositories/UserPublicOrganRoleRepository.cs`
    - _Requisitos: 1.7_
  - [ ] 2.3 Adicionar `DbSet<UserPublicOrganRole>` em `AppDbContext`
    - _Requisitos: 1.2_
  - [ ] 2.4 Registrar `IUserPublicOrganRoleRepository → UserPublicOrganRoleRepository` no DI (Program.cs)
    - _Requisitos: 1.7_
  - [ ] 2.5 Gerar migration `AddUserPublicOrganRoles`
    - Comando: `dotnet ef migrations add AddUserPublicOrganRoles --project src/PlantonHub.Infrastructure --startup-project src/PlantonHub.API`
    - _Requisitos: 1.2_
  - [ ] 2.6 Adicionar `UserPublicOrganRole` na whitelist do `AuditSaveChangesInterceptor`
    - _Requisitos: (auditoria interna)_

- [ ] 3. Application — TenantService + policy
  - [ ] 3.1 Adicionar `Task<Guid?> GetCurrentPublicOrganIdAsync()` (ou sync `GetCurrentPublicOrganId()`) em `ITenantService`
    - Ler de `HttpContext.Items["CurrentPublicOrganId"]` (sync, sem sync-over-async)
    - _Requisitos: 1.6_
  - [ ] 3.2 Adicionar `CanAccessPublicOrgan(Guid organId)` em `ITenantService` para autorização granular futura
    - _Requisitos: 3.3_
  - [ ] 3.3 Implementar em `TenantService`
    - _Requisitos: 1.6_
  - [ ] 3.4 Adicionar policy `"GestorPublico"` em `AuthorizationExtensions.cs`
    - `HasRole(context, "GestorPublico")`
    - _Requisitos: 1.5_

- [ ] 4. API — middleware + Cognito Lambda
  - [ ] 4.1 Estender `TenantMiddleware.InvokeAsync` para resolver `publicOrganId`
    - Prefere claim JWT (`publicOrganId`)
    - Fallback DB via `IUserPublicOrganRoleRepository` (com in-process cache — reaproveita `_identityCache`)
    - Grava em `HttpContext.Items["CurrentPublicOrganId"]`
    - _Requisitos: 1.7_
  - [ ] 4.2 Estender Cognito pre-token-generation Lambda (`infrastructure/lambda/pre-token/`)
    - Query em `UserPublicOrganRole` quando user está no grupo `GestorPublico`
    - Injetar claim `publicOrganId` como string GUID
    - _Requisitos: 1.4_
  - [ ] 4.3 Criar grupo Cognito `GestorPublico` via CDK ou console
    - _Requisitos: 1.3_
  - [ ] 4.4 Atualizar `DatabaseSeeder` para criar user gestor de teste
    - Email: `gestor@plantonhub.com`, senha: `Teste@123`
    - Atribuir a `PublicOrgan` "Prefeitura Municipal de Santo André" (já seedada)
    - _Requisitos: (para testes)_

- [ ] 5. Testes 7A
  - [ ] 5.1 Unit — `TenantServiceTests.cs` (edit)
    - **8 testes** cobrindo `GetCurrentPublicOrganId` (claim presente, ausente, inválido, HttpContext null) + `CanAccessPublicOrgan`
    - _Requisitos: 8.2_
  - [ ] 5.2 Unit — `TenantBypassTests.cs` ou novo `TenantMiddlewarePublicOrganTests.cs`
    - **5 testes** cobrindo: claim resolvido, fallback DB, sem gestor role, cache hit, cache TTL expirado
    - _Requisitos: 8.3_
  - [ ] 5.3 Unit — `AuthorizationExtensionsTests.cs` (edit)
    - **4 testes** para policy `GestorPublico`: autorizado, negado (medico), negado (admin), negado (sem role)
    - _Requisitos: 8.4_

- [ ] 6. Checkpoint Sprint 7A
  - [ ] 6.1 Rodar unit + property + vitest, todos verdes
  - [ ] 6.2 Rodar migration local, checar schema no Postgres
  - [ ] 6.3 Commit + push
  - Ensure all tests pass, ask the user if questions arise.

## Sprint 7B — Backend endpoints

Read-only APIs filtradas por escopo. Testáveis via Swagger sem UI.

- [ ] 7. Application — service + DTOs
  - [ ] 7.1 Criar `src/PlantonHub.Application/Interfaces/IPrefeituraService.cs`
    - Métodos: `GetDashboardAsync()`, `GetKpisAsync(from, to)`, `GetClinicsAsync()`, `GetShiftsAsync(from, to, clinicId?)`, `GetFrequencyAsync(from, to, clinicId?)`, `GetAbsencesAsync(from, to, type?)`, `GetHistoryAsync(from, to, type?, search?, page, pageSize)`, `GetRealtimeAsync()`
    - _Requisitos: 2.1-2.8_
  - [ ] 7.2 Criar DTOs em `src/PlantonHub.Application/DTOs/Prefeitura/`
    - `PrefeituraDashboardResponse.cs`, `PrefeituraKpisResponse.cs`, `PrefeituraClinicItem.cs`, `PrefeituraShiftItem.cs`, `PrefeituraFrequencyItem.cs`, `PrefeituraAbsenceItem.cs`, `PrefeituraHistoryItem.cs`, `PrefeituraHistoryPage.cs`, `PrefeituraRealtimeResponse.cs`
    - _Requisitos: 2.1-2.8_
  - [ ] 7.3 Estender `IPublicOrganRepository`
    - `Task<IEnumerable<Guid>> GetDescendantIdsAsync(Guid rootId)` — recursivo
    - _Requisitos: 3.2_
  - [ ] 7.4 Estender `IContractRepository`
    - `Task<IEnumerable<Guid>> GetActiveClinicIdsByOrganIdsAsync(IEnumerable<Guid> organIds)`
    - _Requisitos: 3.1_

- [ ] 8. Application — implementação
  - [ ] 8.1 Implementar `PrefeituraService` com todos os métodos
    - Cada método:
      1. Lê `_tenantService.GetCurrentPublicOrganId()` (throw se null)
      2. Cache lookup na chave (`CacheKeys.PrefeituraDashboard(organId)` etc.)
      3. Se miss: resolve scope (descendentes), lista clinicIds, agrega
      4. Cache set com TTL apropriado
      5. Retorna DTO
    - _Requisitos: 2.1-2.8, 3.1-3.3_
  - [ ] 8.2 Adicionar entradas em `CacheKeys`
    - `PrefeituraDashboard`, `PrefeituraKpis`, `PrefeituraClinics`, `PrefeituraFrequency`, `PrefeituraAbsences`, `PrefeituraRealtime`, `OrganScope`
    - _Requisitos: (performance)_
  - [ ] 8.3 Registrar `IPrefeituraService → PrefeituraService` no DI

- [ ] 9. API — controller
  - [ ] 9.1 Criar `src/PlantonHub.API/Controllers/PrefeituraController.cs`
    - 8 endpoints GET, todos `[Authorize(Policy = "GestorPublico")]`
    - `[EnableRateLimiting("Session")]` para reaproveitar policy existente
    - `ProducesResponseType` completo para OpenAPI/Swagger
    - _Requisitos: 2.1-2.8_

- [ ] 9.5. Acionar OS (mutação controlada)
  - [ ] 9.5.1 Adicionar `NotifyOsAboutAbsenceAsync(Guid absenceId, string? message)` em `IPrefeituraService`
    - Reusa `IAlertsService.CreateAsync` — nenhuma duplicação
    - Valida scope da ausência
    - _Requisitos: 10.1_
  - [ ] 9.5.2 Adicionar rate limit policy `PrefeituraNotifyOs` em `Program.cs` (5/min por user)
    - _Requisitos: 10.4_
  - [ ] 9.5.3 Endpoint `POST /api/prefeitura/absences/{absenceId}/notify-os` no `PrefeituraController`
    - `[Authorize(Policy = "GestorPublico")]`
    - `[EnableRateLimiting("PrefeituraNotifyOs")]`
    - _Requisitos: 10.1-10.4_
  - [ ] 9.5.4 DTO `NotifyOsRequest` com `Message` opcional

- [ ] 9.6. Exportação PDF/Excel
  - [ ] 9.6.1 Adicionar pacotes NuGet
    - `QuestPDF` (última estável, license MIT)
    - `ClosedXML` (última estável, license MIT)
    - _Requisitos: 11.2_
  - [ ] 9.6.2 Criar estrutura `src/PlantonHub.Application/Reports/`
    - `IReportGenerator.cs`, `ReportType.cs`, `ReportFormat.cs`, `ReportRequest.cs`
    - `Pdf/SharedComponents.cs` (header + footer com logo 24p7 + filtros aplicados)
    - _Requisitos: 11.3_
  - [ ] 9.6.3 Templates PDF em `src/PlantonHub.Application/Reports/Pdf/`
    - `KpisPdfDocument.cs`, `FrequencyPdfDocument.cs`, `AtrasosPdfDocument.cs`, `AusenciasPdfDocument.cs`, `HistoryPdfDocument.cs`
    - _Requisitos: 11.3_
  - [ ] 9.6.4 Templates Excel em `src/PlantonHub.Application/Reports/Excel/`
    - `FrequencyExcelWorkbook.cs`, `AtrasosExcelWorkbook.cs`, `AusenciasExcelWorkbook.cs`, `HistoryExcelWorkbook.cs`
    - (kpis não tem versão Excel)
    - _Requisitos: 11.4_
  - [ ] 9.6.5 `IReportService` + `ReportService.GenerateAsync(ReportRequest)` — orquestra tipo/formato
  - [ ] 9.6.6 Rate limit policy `PrefeituraExport` (10/min por user)
    - _Requisitos: 11.7_
  - [ ] 9.6.7 Endpoint `GET /api/prefeitura/reports/{reportType}/export?format=...` no `PrefeituraController`
    - Retorna `File(bytes, contentType, filename)` com `Content-Disposition: attachment`
    - Validação de `reportType` e `format` retorna 400
    - Se bytes > 5MB retorna 413 com mensagem em pt-BR
    - _Requisitos: 11.1-11.7_

- [ ] 10. Testes 7B
  - [ ] 10.1 Unit — `PrefeituraServiceTests.cs` (novo)
    - **30 testes** cobrindo os 8 métodos, permissão, agregações, hierarquia
    - Mocks: `ITenantService`, `IPublicOrganRepository`, `IContractRepository`, `IAttendanceRepository`, `IShiftRepository`, `ICacheService`
    - _Requisitos: 8.1_
  - [ ] 10.2 Unit — `PrefeituraControllerTests.cs` (opcional, boa cobertura)
    - **15 testes** cobrindo cada endpoint: happy path, sem gestor role → 403, params inválidos → 400
    - _Requisitos: 8.1_
  - [ ] 10.3 Property — `PrefeituraPropertyTests.cs` (novo)
    - **Propriedade 1:** Isolamento por organ
    - **Propriedade 2:** Hierarquia recursiva
    - **Propriedade 3:** Idempotência de agregações
    - 5 propriedades total
    - _Requisitos: 8.5_
  - [ ] 10.4 Integration — `PrefeituraFlowIntegrationTests.cs` (novo)
    - **10 testes** com Testcontainers + Cognito real
    - Login gestor → dashboard OK
    - Gestor sem contrato → dados vazios (200, não 500)
    - Gestor tenta `/api/admin/*` → 403
    - Realtime cross-clinic
    - Fallback middleware sem claim
    - _Requisitos: 8.6_

- [ ] 11. Checkpoint Sprint 7B
  - [ ] 11.1 Rodar 3 suites de testes verdes
  - [ ] 11.2 Rodar Swagger local, exercitar cada endpoint com token gestor
  - [ ] 11.3 Verificar cache Redis batendo (via `redis-cli MONITOR` ou logs)
  - [ ] 11.4 Commit + push
  - Ensure all tests pass, ask the user if questions arise.

## Sprint 7C — Frontend

12 telas + rotas + api + i18n + testes vitest.

- [ ] 12. Rotas e layout base
  - [ ] 12.1 Adicionar 3 rotas em `frontend/src/App.tsx`
    - `/prefeitura/login` (público)
    - `/prefeitura` (protected, roles=[GestorPublico])
    - `/prefeitura/tv` (protected, roles=[GestorPublico])
    - _Requisitos: 4.1-4.3_
  - [ ] 12.2 Ajustar `AppLayout` para esconder header top em `/prefeitura*`
    - Mesma lógica de `/admin*` já existente
    - _Requisitos: 4.5_
  - [ ] 12.3 Ajustar `AdminLoginPage.useEffect` de redirect por role
    - AdminGlobal/AdminClinica → `/admin`
    - GestorPublico → `/prefeitura`
    - _Requisitos: 4.6_
  - [ ] 12.4 Ajustar `LoginPage.useEffect` similarmente (gestor não passa por `/login` mas se cair, redirect)
    - _Requisitos: 4.7_

- [ ] 13. API client + tipos
  - [ ] 13.1 Criar `frontend/src/api/prefeituraApi.ts`
    - 8 métodos espelhando o backend
    - Reaproveita `axiosInstance` (já tem interceptors de refresh)
    - _Requisitos: 2.1-2.8_
  - [ ] 13.2 Estender `frontend/src/types/index.ts`
    - Tipos: `PrefeituraDashboardResponse`, `PrefeituraKpisResponse`, `PrefeituraClinicItem`, `PrefeituraShiftItem`, `PrefeituraFrequencyItem`, `PrefeituraAbsenceItem`, `PrefeituraHistoryItem`, `PrefeituraHistoryPage`, `PrefeituraRealtimeResponse`, `PrefeituraView`
    - _Requisitos: 2.1-2.8_

- [ ] 14. Página de login
  - [ ] 14.1 Criar `frontend/src/pages/prefeitura/PrefeituraLoginPage.tsx`
    - Baseado em `AdminLoginPage.tsx` + mock `op-login.html`
    - Ids únicos: `#prefeitura-email`, `#prefeitura-password`
    - Botão: "Acessar portal"
    - Após login: redirect por role (via `useAuth`)
    - _Requisitos: 5.1_
  - [ ] 14.2 Criar `frontend/src/pages/prefeitura/PrefeituraLoginPage.module.css`
    - Extrair CSS do `op-login.html`
    - _Requisitos: 5.1_

- [ ] 15. Layout `PrefeituraPage` + sub-views
  - [ ] 15.1 Criar `frontend/src/pages/prefeitura/PrefeituraPage.tsx`
    - Layout com sidebar + main content
    - `activeView: PrefeituraView` state-based
    - Nav items: Início, KPIs, Escalas, Frequência, Atrasos, Ausências, Histórico, Tempo Real, Modo TV (link externo)
    - _Requisitos: 4.2_
  - [ ] 15.2 Criar `PrefeituraWelcome.tsx` (view "home")
    - Extrair do `op-welcome.html`
    - Fetch `getDashboard()` no mount, mostra KPIs + resumo do dia
    - _Requisitos: 5.2_
  - [ ] 15.3 Criar `PrefeituraKpis.tsx`
    - Extrair do `op-kpis.html`
    - Filtro de período (from/to)
    - Fetch `getKpis()`
    - _Requisitos: 5.3_
  - [ ] 15.4 Criar `PrefeituraEscalas.tsx`
    - Extrair do `op-escalas.html`
    - Grade semanal read-only
    - Filtro por UPA (dropdown com `getClinics()`)
    - Fetch `getShifts()`
    - _Requisitos: 5.4_
  - [ ] 15.5 Criar `PrefeituraFrequencia.tsx`
    - Extrair do `op-frequencia.html`
    - Tabela previsto vs realizado
    - Filtros: período, UPA
    - Fetch `getFrequency()`
    - _Requisitos: 5.5_
  - [ ] 15.6 Criar `PrefeituraAtrasos.tsx`
    - Extrair do `op-atrasos.html`
    - Fetch `getAbsences({ type: 'Late' })`
    - _Requisitos: 5.6_
  - [ ] 15.7 Criar `PrefeituraAusencias.tsx`
    - Extrair do `op-ausencias.html`
    - Fetch `getAbsences({ type: 'Absence' })`
    - Alerta destacado no header quando `alertLevel !== 'ok'`
    - Coluna "Ações" com botão vermelho "Acionar OS" por linha (abre modal)
    - Botões "Exportar PDF" e "Exportar Excel" no topbar
    - _Requisitos: 5.7, 10.5, 11.8_
  - [ ] 15.8 Criar `PrefeituraHistorico.tsx`
    - Extrair do `op-historico.html`
    - Toggle Timeline / Tabela
    - Paginação (30 items por página)
    - Filtros: período, tipo, busca
    - Fetch `getHistory()`
    - _Requisitos: 5.8_
  - [ ] 15.9 Criar `PrefeituraRealtime.tsx`
    - Extrair do `op-realtime.html`
    - Polling 15s via `setInterval` + `useRef` cleanup
    - Cards de UPA com estado
    - Fetch `getRealtime()`
    - _Requisitos: 5.9_

- [ ] 15.10 Reports export — botões nas outras 4 telas
  - [ ] 15.10.1 Adicionar botões "Exportar PDF" (+ "Exportar Excel" onde aplica) em `PrefeituraKpis`, `PrefeituraFrequencia`, `PrefeituraAtrasos`, `PrefeituraHistorico`
    - Style padrão dos mocks (`btn-pdf`/`btn-xlsx`)
    - _Requisitos: 5.3, 5.5, 5.6, 5.8, 11.8_
  - [ ] 15.10.2 Helper `downloadReport()` em `prefeituraApi.ts`
    - Fetch com `responseType: 'blob'` + Bearer token
    - Parse `Content-Disposition` para pegar filename do server
    - Cria `<a download>` com `URL.createObjectURL`, dispara click, revoga
    - _Requisitos: 11.8_
  - [ ] 15.10.3 UX: enquanto baixa, mostra spinner no botão + toast de sucesso ao final
    - Se 413 do backend (>5MB): toast pedindo pra filtrar mais
    - Se erro genérico: toast vermelho com detalhe

- [ ] 15.11 Modal "Acionar OS"
  - [ ] 15.11.1 Componente `AcionarOsModal.tsx` em `pages/prefeitura/components/`
    - Props: `absenceId`, `open`, `onClose`, `onSuccess`
    - Textarea opcional para descrição
    - Botão "Confirmar acionamento" (vermelho) + "Cancelar"
    - Chama `prefeituraApi.notifyOs(absenceId, message)`
    - Toast de sucesso: "OS acionada com sucesso"
    - _Requisitos: 10.5_
  - [ ] 15.11.2 Integração em `PrefeituraAusencias.tsx`
    - Estado `acionarModal: { open: boolean, absenceId: Guid | null }`
    - Click no botão de linha → abre modal com `absenceId` daquela linha
    - onSuccess → refetch da lista de ausências (o alert já foi criado; ausência não muda)

- [ ] 16. Modo TV
  - [ ] 16.1 Criar `frontend/src/pages/prefeitura/PrefeituraTvMode.tsx`
    - Extrair do `op-tv.html`
    - Fullscreen dark theme
    - Polling 10s
    - Auto-refresh de token via interceptor axios (já existe)
    - Detecção de failure → redirect `/prefeitura/login?tv=1`
    - _Requisitos: 5.10, 6.1-6.4_
  - [ ] 16.2 Criar `PrefeituraTvMode.module.css`
    - _Requisitos: 5.10_
  - [ ] 16.3 Ajustar `PrefeituraLoginPage` para respeitar `?tv=1` query param
    - Após login: se `tv=1` na URL, redirect para `/prefeitura/tv` (não `/prefeitura`)
    - _Requisitos: 6.1_

- [ ] 17. i18n
  - [ ] 17.1 Adicionar chaves em `frontend/src/i18n/locales/pt.json` sob `prefeitura.*`
    - ~150 chaves cobrindo todas as strings visíveis
    - _Requisitos: 7.1_
  - [ ] 17.2 Traduzir para `en.json` — paridade
    - _Requisitos: 7.2_
  - [ ] 17.3 Traduzir para `es.json` — paridade
    - _Requisitos: 7.2_

- [ ] 18. Testes vitest
  - [ ] 18.1 Criar `frontend/src/pages/prefeitura/__tests__/PrefeituraLoginPage.test.tsx`
    - ~15 testes cobrindo form, validação, submit, redirect
    - _Requisitos: 8.7_
  - [ ] 18.2 `PrefeituraPage.test.tsx` — sidebar, active state, navegação
    - ~15 testes
    - _Requisitos: 8.7_
  - [ ] 18.3 `PrefeituraWelcome.test.tsx` — render, loading, error
    - ~10 testes
    - _Requisitos: 8.7_
  - [ ] 18.4 `PrefeituraKpis.test.tsx` — filtros, agregação client-side
    - ~15 testes
    - _Requisitos: 8.7_
  - [ ] 18.5 `PrefeituraEscalas.test.tsx` — grid, filtro
    - ~20 testes
    - _Requisitos: 8.7_
  - [ ] 18.6 `PrefeituraFrequencia.test.tsx` — tabela, filtros
    - ~20 testes
    - _Requisitos: 8.7_
  - [ ] 18.7 `PrefeituraAtrasos.test.tsx` + `PrefeituraAusencias.test.tsx`
    - ~15 testes cada (30 total)
    - _Requisitos: 8.7_
  - [ ] 18.8 `PrefeituraHistorico.test.tsx` — toggle, paginação, filtros
    - ~25 testes
    - _Requisitos: 8.7_
  - [ ] 18.9 `PrefeituraRealtime.test.tsx` — polling, cleanup timer
    - ~20 testes (incluindo teste de timer não vazado — igual fix do `AdminConfiguracoes`)
    - _Requisitos: 8.7_
  - [ ] 18.10 `PrefeituraTvMode.test.tsx` — polling, refresh, redirect
    - ~15 testes
    - _Requisitos: 8.7_
  - [ ] 18.11 `prefeituraApi.test.ts` — shape dos requests/responses
    - ~10 testes
    - _Requisitos: 8.7_

- [ ] 19. Checkpoint Sprint 7C
  - [ ] 19.1 Rodar `npx vitest --run` — 522 + ~215 = **~737 testes**, todos verdes, zero unhandled errors
  - [ ] 19.2 Rodar `dotnet test tests/PlantonHub.UnitTests` + `PropertyTests` verdes (regressão)
  - [ ] 19.3 Rodar frontend local com stack (docker compose up), navegar manualmente com usuário gestor seedado
  - [ ] 19.4 Commit + push
  - Ensure all tests pass, ask the user if questions arise.

## Sprint 7D — Polish (E2E + docs + perf)

Fecha a sprint com validação end-to-end e documentação.

- [ ] 20. E2E Playwright
  - [ ] 20.1 Criar `frontend/e2e/prefeitura-flows.spec.ts`
    - 9 smokes: login → home ativa, click KPIs, click Escalas, click Frequência, click Realtime, /prefeitura sem login → redirect, gestor tenta /admin → redirect, download de PDF (KPIs), click "Acionar OS" abre modal
    - _Requisitos: 8.8, 10.5, 11.8_
  - [ ] 20.2 Criar `frontend/e2e/prefeitura-tv.spec.ts`
    - 3 testes: fullscreen renderiza, polling refetch dispara (network intercept), 401 → redirect com `?tv=1`
    - _Requisitos: 8.8_
  - [ ] 20.3 Ajustar `frontend/e2e/fixtures.ts`
    - `PREFEITURA_CREDENTIALS` + `loginAsPrefeitura(page)` helper
    - _Requisitos: 8.8_

- [ ] 21. k6 performance
  - [ ] 21.1 Criar `tests/k6/flows/prefeitura-read.js`
    - Fluxo: dashboard → kpis → frequency → realtime
    - _Requisitos: 8.9_
  - [ ] 21.2 Criar `tests/k6/scenarios/prefeitura-smoke.js`
    - 1 VU, 30s, thresholds default (p95 < 500ms)
    - _Requisitos: 8.9_
  - [ ] 21.3 Ajustar `tests/k6/lib/auth.js`
    - Aceitar override de credenciais (gestor) via env var `TEST_USER_ROLE`
    - _Requisitos: 8.9_
  - [ ] 21.4 Adicionar `prefeitura-smoke.js` no dropdown do workflow_dispatch em `.github/workflows/perf.yml`
    - _Requisitos: 8.10_

- [ ] 22. Documentação
  - [ ] 22.1 Atualizar `README.md` (raiz)
    - Nova seção "Portal Prefeitura" com URL, credenciais teste, screenshot opcional
    - Adicionar linha na tabela de usuários seed: `gestor@plantonhub.com / Teste@123 / GestorPublico`
    - _Requisitos: 9.1_
  - [ ] 22.2 Atualizar `frontend/README.md`
    - Adicionar linhas na tabela de rotas:
      - `/prefeitura/login` — Login gestor
      - `/prefeitura` — Portal Prefeitura (GestorPublico)
      - `/prefeitura/tv` — Modo TV (GestorPublico)
    - _Requisitos: 9.2_
  - [ ] 22.3 Atualizar `tests/k6/README.md`
    - Novo cenário `prefeitura-smoke.js`
    - _Requisitos: 8.9_
  - [ ] 22.4 Criar `docs/portal-prefeitura.md`
    - Guia funcional das 10 telas
    - Modelo de auth (`GestorPublico`, `UserPublicOrganRole`, claim `publicOrganId`)
    - Hierarquia parent/child (gestor de raiz vê descendentes)
    - Modo TV (setup e refresh)
    - Como um AdminGlobal cria um gestor (fluxo administrativo)
    - _Requisitos: 9.3_

- [ ] 23. Checkpoint Sprint 7D
  - [ ] 23.1 Rodar unit + property + vitest verdes
  - [ ] 23.2 Rodar E2E Playwright localmente (docker compose up + npx playwright test)
    - Se falhar auth: aceitar como blocked-on-CI, comentar
  - [ ] 23.3 Trigger manual do workflow `perf.yml → prefeitura-smoke.js` no CI, verificar baseline
  - [ ] 23.4 Commit + push
  - Ensure all tests pass, ask the user if questions arise.

## Notas

- Tarefas marcadas com `_Requisitos: X.Y_` rastreiam para o `requirements.md`
- Cada sprint termina com "Checkpoint" que executa a validação padrão
- Sprint 7A → 7B são sequenciais (7B depende do model de auth)
- Sprint 7C pode começar depois de 7A verde, em paralelo com o final da 7B
- Sprint 7D deve rodar depois de 7C mergeada
- Se a Lambda pre-token não puder ser atualizada nesta sprint (bloqueio
  operacional), 7A e 7B ainda funcionam via fallback DB do middleware.
  Só é preciso ajustar os integration tests para simular claim ausente.
- Testes de propriedade usam a mesma library FsCheck já em uso
  (`tests/PlantonHub.PropertyTests`)
- Testes vitest usam a mesma configuração já em uso (`frontend/vitest.config.ts`)
- Modo TV usa `setInterval` + `useRef` para cleanup — mesmo padrão do
  fix aplicado em `AdminConfiguracoes.tsx` durante a auditoria

## Fora do escopo

Explicitamente NÃO faz parte desta sprint:

- Justificativas, aprovações, correções (continuam no Admin OS)
- Escrita de dados operacionais (o único write do gestor é criar Alert via Acionar OS)
- Exportação PDF/Excel dos relatórios
- Notificações push para gestor
- Chat/comentários em eventos
- Configuração de contratos via portal
- Multi-organ para o mesmo gestor (débito documentado no design.md § R4)
- Migração de query recursiva para SQL CTE (só se ficar lento em prod — Sprint 8)
- Materialized views para agregações históricas (só se ficar lento — Sprint 8)

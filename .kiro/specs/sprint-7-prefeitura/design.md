# Design: Portal Prefeitura

## Overview

Portal read-only para o gestor público (GestorPublico) acompanhar as
UPAs que ele contratou via `Contract`. Aproveita 90% do modelo de dados
já existente e adiciona uma nova entity de junção
(`UserPublicOrganRole`), um novo role, uma nova policy e um novo bloco
de endpoints `/api/prefeitura/*` filtrados por escopo hierárquico.

Frontend com layout próprio (sidebar state-based, similar ao
`AdminPage`) mais um modo TV fullscreen para display de monitoramento.

## Architecture

Aproveita a Clean Architecture existente (Domain, Application,
Infrastructure, API) sem novas camadas. Adiciona:

- **Domain:** um enum value (`RoleType.GestorPublico`) e uma entity
  de junção (`UserPublicOrganRole`).
- **Application:** um novo service (`PrefeituraService`) + reuso
  parcial de `AlertsService` (para Acionar OS) e novo `ReportService`
  (para PDF/Excel).
- **Infrastructure:** um repository (`UserPublicOrganRoleRepository`),
  uma nova config de entity, uma migration. Duas bibliotecas novas:
  `QuestPDF` e `ClosedXML`.
- **API:** um controller (`PrefeituraController`) com 10 endpoints,
  duas policies novas de rate limit, e uma policy de autorização
  (`GestorPublico`).
- **Middleware:** extensão em `TenantMiddleware` para resolver
  `publicOrganId` do JWT + fallback DB.
- **Cognito:** grupo `GestorPublico` + estensão da Lambda pre-token
  para injetar claim `publicOrganId`.

Frontend segue o padrão do Admin OS: rota `/prefeitura` protegida,
layout com sidebar state-based, uma rota extra `/prefeitura/tv`
fullscreen. Uma nova pasta `pages/prefeitura/` com 12 componentes
espelhando o padrão `pages/admin/`.

## Decisões de arquitetura

### D1. Modelo de auth: `UserPublicOrganRole` separado

**Rejeitada:** expandir `UserClinicRole` com `PublicOrganId nullable`.

**Motivo:** `UserClinicRole` tem semântica "usuário atua nessa clínica
com esse role". O gestor da Prefeitura NÃO atua na clínica — ele
fiscaliza várias. Misturar os dois escopos numa mesma tabela deixaria
o modelo confuso, e o backend precisaria de branching em toda query
por role.

**Escolhida:** nova entity `UserPublicOrganRole` (junction User ↔
PublicOrgan), independente. Único constraint (UserId, PublicOrganId).
Um mesmo user pode ser gestor de vários órgãos (multi-tenancy simétrico
ao médico multi-clínica).

### D2. Cognito claim `publicOrganId` via Lambda pre-token

**Rejeitada:** deixar sem claim e usar sempre DB fallback do middleware.

**Motivo:** o fallback já funciona (validado indiretamente pelo run do
k6 na Sprint B), mas força um lookup DB no hot path da primeira
request de cada 10 minutos por usuário. Volume é baixo hoje, mas se o
portal crescer a economia importa.

**Escolhida:** estender o Lambda pre-token-generation existente (que já
injeta `roles` e `clinicIds`) para incluir `publicOrganId` quando o
usuário estiver no grupo `GestorPublico`. Custo: ~1h de trabalho no
Lambda, mesma query pattern das clinicIds.

O fallback DB continua funcionando como safety net — se a Lambda
falhar por qualquer motivo, o middleware resolve via
`UserPublicOrganRoleRepository`.

### D3. Hierarquia recursiva: raiz vê descendentes

**Rejeitada:** gestor da raiz vê só a raiz, subprefeitura tem que ter
seu próprio user separado.

**Motivo:** organograma real é hierárquico. Prefeitura Municipal
contrata a OS pra gerir várias UPAs, e as subprefeituras (zonais)
gerenciam subconjuntos. Um secretário municipal precisa ver TUDO;
um subprefeito só vê a zona dele.

**Escolhida:** gestor de organ raiz vê união recursiva
(organ + `PublicOrgan.Children.**` transitivamente). Gestor de organ
folha vê só ele mesmo.

Implementação:

- Postgres tem CTE recursivo (`WITH RECURSIVE`) — dá pra fazer numa query só.
- Ou lookup em memória via `IPublicOrganRepository.GetDescendantsAsync(rootId)`
  que faz N queries. Simples de testar e o cache Redis pega o resultado.

**Escolhida a segunda opção** — mais simples, tem cache Redis (TTL 5min)
por cima, evita raw SQL específico do dialeto.

### D4. Modo TV: token Cognito de longa duração

**Rejeitada:** endpoint público com API key rotativa.

**Motivo:** cria novo modelo de auth só para uma tela, adiciona
superfície de segurança sem benefício.

**Escolhida:** mesmo Cognito, mas com ciclo de refresh mais agressivo:

- Login inicial normal (email + senha + MFA opcional)
- Refresh token salvo em localStorage do device
- Cognito refresh token TTL padrão é 30 dias — cobre bem
- Reautenticação automática 5min antes do ID token expirar (1h padrão)
- Se refresh falhar (deslogado, token revogado): volta pra tela de login
  na próxima tick de refresh; user do físico intervém

### D5. Read-only com 2 exceções controladas

Portal Prefeitura é **read-only por padrão**, com duas exceções
específicas que fazem sentido para o gestor sem tocar em operação:

1. **Acionar OS** (`POST /prefeitura/absences/{id}/notify-os`) — o gestor
   cria um `Alert` para a OS quando encontra uma ausência crítica.
   Não altera a ausência, o plantão, nem qualquer entidade operacional.
   É um "sinal" — o Admin OS decide se abre justificativa, corrige
   plantão, etc.
2. **Exportação** (`GET /prefeitura/reports/{type}/export?format=pdf|xlsx`) —
   tecnicamente GET, sem efeito colateral no DB, mas retorna binário
   gerado no momento. Ver seção "Exportação PDF/Excel" abaixo.

Justificativas, aprovações, correção de check-in, criação/edição de
escalas continuam sendo responsabilidade do Admin OS.

Vantagens do modelo:

- A única mutação (Acionar OS) reusa o `AlertsService` existente. Zero
  código novo de escrita no `PrefeituraService`.
- Cache Redis com TTL curto (30-60s) para reads, sem invalidação
  cirúrgica — dado mudou, gestor vê 30s depois. Aceitável para
  fiscalização.
- Exports não passam por cache (binários grandes, geração ad-hoc).

## Data Models

### Alterações mínimas

```
Enum RoleType
  AdminGlobal = 1
  AdminClinica = 2
  Medico = 3
  Enfermeiro = 4
  Tecnico = 5
+ GestorPublico = 6
```

### Nova entity: `UserPublicOrganRole`

```csharp
public class UserPublicOrganRole
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid PublicOrganId { get; set; }
    public PublicOrgan PublicOrgan { get; set; } = null!;
    public RoleType Role { get; set; } // sempre GestorPublico por enquanto
    public DateTime AssignedAt { get; set; }
}
```

Configuração EF:

- PK: `Id`
- Unique constraint composto: `(UserId, PublicOrganId)`
- FK cascata em `User` e `PublicOrgan` (soft delete no futuro se
  necessário)
- Índice em `PublicOrganId` (queries de reverso: quem são os gestores
  desse organ)

Migration: `AddUserPublicOrganRoles.cs`. Zero risco (tabela nova, sem
alteração no existente).

### Nada muda em

- `User`, `Clinic`, `Shift`, `Attendance`, `PublicOrgan`, `Contract`
- Todo o modelo já existe. `PublicOrgan.Contracts` (nav) e
  `Contract.Clinics` (nav) já dão o caminho para ir de organ → UPAs.

### Whitelist do `AuditSaveChangesInterceptor`

Adicionar `UserPublicOrganRole` para auditar quem virou gestor de que
organ. Já auditamos `UserClinicRole`; padrão simétrico.

## Components and Interfaces

### Autenticação e autorização — fluxo de login (Cognito + claim)

```
Frontend                Cognito              Lambda pre-token
   │                        │                      │
   │──POST /InitiateAuth───►│                      │
   │  (email + password)    │                      │
   │                        │                      │
   │                        │──trigger pre-token──►│
   │                        │                      │
   │                        │        Lambda query no RDS:
   │                        │        - SELECT role FROM UserClinicRole WHERE UserId=@
   │                        │        - SELECT role FROM UserPublicOrganRole WHERE UserId=@
   │                        │        - Se GestorPublico: buscar PublicOrgan.Id
   │                        │                      │
   │                        │◄──claims injetados───│
   │                        │  roles, clinicIds,   │
   │                        │  publicOrganId       │
   │◄──ID Token + Refresh───│                      │
   │                        │                      │

Frontend redireciona por role:
  - AdminGlobal/AdminClinica → /admin
  - GestorPublico           → /prefeitura
  - Medico/Enfermeiro/Tecnico → /doctor
```

### TenantMiddleware — extensão

Adicionar após o resolver de `userId` e `clinicIds`:

```csharp
// 1) Prefer o claim (fast path)
var claim = context.User.FindFirst("publicOrganId")?.Value;
if (Guid.TryParse(claim, out var organId))
{
    context.Items["CurrentPublicOrganId"] = organId;
}
else if (isGestorPublico)
{
    // 2) Fallback DB (raro — Lambda falhou ou usuário legado)
    var repo = context.RequestServices.GetService<IUserPublicOrganRoleRepository>();
    var roles = await repo.GetByUserIdAsync(resolvedUserId.Value);
    if (roles.FirstOrDefault() is { } first)
    {
        context.Items["CurrentPublicOrganId"] = first.PublicOrganId;
        // Cache também no _identityCache — próxima request é O(1)
    }
}
```

`TenantService.GetCurrentPublicOrganId()` lê de `HttpContext.Items` (sync,
sem sync-over-async).

### Policy `GestorPublico`

```csharp
options.AddPolicy("GestorPublico", policy =>
    policy.RequireAssertion(context => HasRole(context, "GestorPublico")));
```

Nada de composição com AdminGlobal — o gestor é um perfil paralelo, não
subordinado. Um AdminGlobal que quer ver dados de Prefeitura deve
consultar via Admin OS (que já tem os endpoints agregados sem filtro).

## Endpoints

### Contract

Todos GET, todos `[Authorize(Policy = "GestorPublico")]`, todos scoped
implicitamente por `_tenantService.GetCurrentPublicOrganId()`.

| Endpoint | Retorna | Cache | Consumido por |
|---|---|---|---|
| `GET /api/prefeitura/dashboard` | KPIs do dia + resumo | 30s Redis | Welcome, KPIs card |
| `GET /api/prefeitura/kpis?from&to` | Métricas por período | 60s Redis | KPIs page |
| `GET /api/prefeitura/clinics` | UPAs ativas do organ | 5min Redis | Dropdowns de filtro |
| `GET /api/prefeitura/shifts?from&to&clinicId?` | Escalas planejadas | Nenhum (dado muda) | Escalas grid |
| `GET /api/prefeitura/frequency?from&to&clinicId?` | Previsto vs realizado | 60s Redis | Frequência |
| `GET /api/prefeitura/absences?from&to&type?` | Ausências e atrasos | 60s Redis | Atrasos + Ausências |
| `GET /api/prefeitura/history?from&to&type?&search?&page&pageSize` | Timeline paginada | Nenhum | Histórico |
| `GET /api/prefeitura/realtime` | Snapshot ao vivo | 15s Redis | Realtime + TV |
| `POST /api/prefeitura/absences/{id}/notify-os` | Alert criado | Nenhum (escrita) | Ausências → modal "Acionar OS" |
| `GET /api/prefeitura/reports/{type}/export?format=pdf|xlsx&<filtros>` | Binário PDF/Excel | Nenhum (dinâmico) | Botões "Exportar PDF/Excel" |

### Semântica do filtro por organ

```csharp
// Pseudocódigo do PrefeituraService
var organId = _tenantService.GetCurrentPublicOrganId()
    ?? throw new UnauthorizedException("No organ context.");

// Descendentes (Children recursivo), cacheado por 5min
var scope = await _cache.GetOrSetAsync(
    CacheKeys.OrganScope(organId),
    () => _organRepo.GetDescendantsAsync(organId),
    ttl: TimeSpan.FromMinutes(5));

// Contratos ativos no escopo → UPAs cobertas
var clinicIds = await _contractRepo.GetActiveClinicIdsByOrganIdsAsync(scope);

// Filtra a query alvo (attendance/shift/etc) por clinicIds
return await _attendanceRepo.GetByClinicIdsAndPeriodAsync(clinicIds, from, to);
```

### DTOs principais (novos)

- `PrefeituraDashboardResponse` — kpis + resumo + últimos alertas
- `PrefeituraKpisResponse` — arrays de métricas por período
- `PrefeituraFrequencyResponse` — items com { clinicId, date, expected, actual, pctPresence }
- `PrefeituraAbsenceItem` — { userId, userName, clinicId, clinicName, date, shift, type, minutesLate?, justified }
- `PrefeituraHistoryItem` — { timestamp, action, userId, userName, clinicName, details }
- `PrefeituraHistoryPage` — { items, page, pageSize, totalCount, totalPages }
- `PrefeituraRealtimeResponse` — { clinics: [{ clinicId, name, presentCount, expectedCount, alertLevel, absentUsers[] }], asOf: iso }

## Acionar OS

Fluxo: gestor vê uma linha de ausência em `PrefeituraAusencias.tsx`, clica em "Acionar OS", modal abre pedindo descrição opcional, submit envia POST → backend cria um `Alert` no Admin OS.

### Endpoint

```
POST /api/prefeitura/absences/{absenceId}/notify-os

Body:
{
  "message": "descrição do gestor (opcional)"
}

Response 201:
{
  "alertId": "guid",
  "createdAt": "iso"
}
```

Autorização:

- Policy `GestorPublico`
- Middleware valida que a `absenceId` pertence a uma clínica dentro do
  escopo do gestor (organ + descendentes). Se não pertencer → 404
  (mesmo comportamento do resto do portal — não vaza existência de
  ausências de outros organs).

Implementação:

```csharp
// PrefeituraController
[HttpPost("absences/{absenceId:guid}/notify-os")]
[Authorize(Policy = "GestorPublico")]
[EnableRateLimiting("PrefeituraNotifyOs")]
public async Task<IActionResult> NotifyOs(Guid absenceId, [FromBody] NotifyOsRequest request)
{
    var alertId = await _prefeituraService.NotifyOsAboutAbsenceAsync(absenceId, request.Message);
    return Created($"/api/alerts/{alertId}", new { alertId, createdAt = DateTime.UtcNow });
}

// PrefeituraService — reusa AlertsService existente
public async Task<Guid> NotifyOsAboutAbsenceAsync(Guid absenceId, string? message)
{
    var organId = _tenantService.GetCurrentPublicOrganId() ?? throw new UnauthorizedException();
    var absence = await _attendanceRepo.GetAbsenceInScopeAsync(absenceId, scope);
    if (absence is null) throw new NotFoundException("Absence not found in scope");

    var alert = new Alert {
        Id = Guid.NewGuid(),
        Level = AlertLevel.Critical,
        Module = "Prefeitura",
        ClinicId = absence.ClinicId,
        Title = "Ausência acionada pela Prefeitura",
        Description = FormatDescription(absence, message),
        IsResolved = false,
        CreatedAt = DateTime.UtcNow,
    };
    await _alertsService.CreateAsync(alert);  // reusa serviço existente
    return alert.Id;
}
```

Rate limit dedicado `PrefeituraNotifyOs`: 5/min por gestor (evita spam
de alertas contra a OS).

O `AdminAlertas.tsx` do Admin OS já lista todos os alertas — nada muda
lá. O gestor vê o alerta aparecer automaticamente do lado do Admin.

## Exportação PDF / Excel

### Bibliotecas escolhidas

- **PDF: [QuestPDF](https://www.questpdf.com/)**
  - License: MIT (uso comercial permitido)
  - API declarativa (compose de documentos como JSX)
  - Suporte a tabelas, imagens, headers/footers, gráficos via QuestPDF.Skia
  - Testável (renderiza pra memória, comparação por hash)
- **Excel: [ClosedXML](https://github.com/ClosedXML/ClosedXML)**
  - License: MIT
  - Alternativa preferida ao EPPlus (que virou comercial na v5+)
  - API fluente, styling completo (bold, cor, borda, autofit)

### Endpoint

```
GET /api/prefeitura/reports/{reportType}/export?format=pdf|xlsx&<filtros>

reportType ∈ { kpis, frequency, atrasos, ausencias, history }
format ∈ { pdf, xlsx }
filtros: os mesmos aceitos pelo endpoint de leitura correspondente
        (kpis usa from/to; frequency usa from/to/clinicId; etc.)

Response:
  Content-Type: application/pdf
                | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  Content-Disposition: attachment; filename="<tipo>-<yyyy-MM-dd>.<ext>"
  Body: binário
```

### Estrutura no backend

```
src/PlantonHub.Application/Reports/
├── IReportGenerator.cs                # interface comum
├── ReportType.cs                      # enum: Kpis, Frequency, Atrasos, Ausencias, History
├── ReportFormat.cs                    # enum: Pdf, Xlsx
├── ReportRequest.cs                   # DTO com filtros
├── Pdf/
│   ├── KpisPdfDocument.cs             # QuestPDF IDocument
│   ├── FrequencyPdfDocument.cs
│   ├── AtrasosPdfDocument.cs
│   ├── AusenciasPdfDocument.cs
│   ├── HistoryPdfDocument.cs
│   └── SharedComponents.cs            # Header, Footer com logo 24p7
└── Excel/
    ├── FrequencyExcelWorkbook.cs
    ├── AtrasosExcelWorkbook.cs
    ├── AusenciasExcelWorkbook.cs
    └── HistoryExcelWorkbook.cs
        (kpis não tem versão Excel)
```

### Controller

```csharp
[HttpGet("reports/{reportType}/export")]
[Authorize(Policy = "GestorPublico")]
[EnableRateLimiting("PrefeituraExport")]
public async Task<IActionResult> ExportReport(
    string reportType,
    [FromQuery] string format,
    [FromQuery] DateTime? from,
    [FromQuery] DateTime? to,
    [FromQuery] Guid? clinicId,
    [FromQuery] string? type,
    [FromQuery] string? search)
{
    if (!Enum.TryParse<ReportType>(reportType, true, out var rt))
        return BadRequest($"Invalid reportType: {reportType}");
    if (!Enum.TryParse<ReportFormat>(format, true, out var rf))
        return BadRequest($"Invalid format: {format}");

    var request = new ReportRequest {
        Type = rt, Format = rf,
        From = from, To = to, ClinicId = clinicId,
        Filter = type, Search = search,
    };

    var (bytes, contentType, filename) = await _reportService.GenerateAsync(request);
    return File(bytes, contentType, filename);
}
```

Rate limit `PrefeituraExport`: 10/min por gestor.

### Notas de implementação

- Documentos QuestPDF são declarativos; usar composition pattern com
  `SharedComponents` (header/footer com logo 24p7) para reduzir
  duplicação
- Filtros aplicados são impressos no header do PDF/Excel (transparência
  ao imprimir/enviar por email)
- Tamanho máximo aceitável do binário: 5MB antes de sinalizar como
  "muito grande, use filtros". Se ultrapassar, retornar 413 com
  mensagem em pt-BR
- Sem cache — cada geração é ad-hoc. Se performance apertar, adicionar
  cache por chave `(reportType, format, hashDosFiltros)` com TTL curto
  (Sprint 8)

### Frontend: download autenticado

```typescript
// prefeituraApi.ts
export async function downloadReport(
  reportType: ReportType,
  format: 'pdf' | 'xlsx',
  filters: Record<string, string>,
): Promise<void> {
  const params = new URLSearchParams({ format, ...filters }).toString();
  const response = await axiosInstance.get(
    `/prefeitura/reports/${reportType}/export?${params}`,
    { responseType: 'blob' },
  );

  const contentDisposition = response.headers['content-disposition'] ?? '';
  const filename = /filename="([^"]+)"/.exec(contentDisposition)?.[1] ?? 'relatorio';

  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

Padrão de blob + `<a download>` porque `<a href>` direto não passa o
Bearer token.

## Frontend

### Rotas (adições em `App.tsx`)

```
/prefeitura/login    → PrefeituraLoginPage (público)
/prefeitura          → PrefeituraPage      (protected, roles=[GestorPublico])
/prefeitura/tv       → PrefeituraTvMode    (protected, roles=[GestorPublico])
```

### Layout state-based (`PrefeituraPage.tsx`)

Espelha `AdminPage.tsx`:

- URL fica em `/prefeitura` sem sub-paths
- Estado `activeView: PrefeituraView` alterna entre:
  `'home' | 'kpis' | 'escalas' | 'frequencia' | 'atrasos' | 'ausencias' | 'historico' | 'realtime'`
- Sidebar com items marcados `.active` conforme `activeView`
- Cada sub-view é um componente separado em `pages/prefeitura/`
- Sidebar tem link separado para "Modo TV" que abre `/prefeitura/tv` em
  nova aba/tela cheia

### Modo TV (`PrefeituraTvMode.tsx`)

Design:

- Fullscreen absoluto (sem sidebar/header do PrefeituraPage)
- Dark theme (paleta do mock: `--bg: #0d1b1b`, `--card: #132424`)
- Auto-refresh: `setInterval(10s)` chamando
  `prefeituraApi.getRealtime()`
- Layout tipo "cockpit": header com relógio + logo + status geral,
  grid de UPAs no meio, footer com resumo agregado
- Handling de refresh token: interceptor axios já cuida (existente)
- Se refresh falhar → redirect pra `/prefeitura/login` com flag
  `?tv=1` pra volar direto pra `/prefeitura/tv` após login

### Sequência de polling do modo TV

```
Component mount
   │
   ▼
useEffect: primeiro fetch imediato
   │
   ▼
setInterval(10s):
  ├── prefeituraApi.getRealtime()
  │      │
  │      ├── HTTP 200 → atualiza state
  │      ├── HTTP 401 → refresh token (interceptor)
  │      │            ├── sucesso → retry
  │      │            └── falha → redirect /prefeitura/login?tv=1
  │      └── HTTP 5xx → mantém último estado, mostra badge "reconectando"
  │
  └── Cleanup on unmount: clearInterval
```

Timer guardado em `useRef` para não vazar entre renders (padrão já
usado no fix do `AdminConfiguracoes.tsx`).

## Diagramas de sequência

### Login → dashboard

```
User    Cognito    Backend    Redis    Postgres
 │─POST InitiateAuth─►│         │        │
 │◄─IdToken (com claim publicOrganId)
 │                    │         │        │
 │─GET /prefeitura/dashboard──►│         │
 │                    │  policy check    │
 │                    │  ← ok            │
 │                    │──cache lookup───►│
 │                    │◄─miss────────────│
 │                    │──scope query────────►│
 │                    │  GetDescendantsAsync │
 │                    │◄─{organ + children}──│
 │                    │──contracts query────►│
 │                    │◄─active clinicIds────│
 │                    │──attendance agg─────►│
 │                    │◄─rows────────────────│
 │                    │──cache set (30s)─►│
 │◄─PrefeituraDashboardResponse
```

### Refresh token no TV mode

```
Timer  Axios  Cognito  Backend
  │──GET /realtime──►│       │
  │                  │──expired ID token   │
  │◄─401             │       │
  │─refresh via SDK──►│      │
  │                  │──POST InitiateAuth (refresh)
  │                  │◄─novo IdToken
  │─salva no LS      │       │
  │──retry GET──────►│       │
  │◄─200             │       │
```

## Testes

### Property tests (FsCheck)

**Propriedade 1: Isolamento por organ**

Para qualquer par (organA, organB) sem relação parent/child:

- dado o token de gestor(organA)
- fazendo GET em qualquer endpoint
- o response NUNCA contém dados vinculados a `organB.Contracts.Clinics`

Implementação: gerar 2 organs isolados, seed com contratos + shifts em
cada, autenticar como gestor(A), afirmar que `dashboard.clinicCount ==
organA.clinicIdsCount` e nenhum `clinicId` do B aparece na resposta.

**Propriedade 2: Hierarquia recursiva**

Para qualquer árvore de organs (root + N filhos):

- dado o token de gestor(root)
- dashboard/kpis/etc agregam dados de root ∪ children ∪ grandchildren
- gestor(child) vê apenas dados do próprio child

Gerar árvores aleatórias com `fast-generator`, seed nos dados, verificar.

**Propriedade 3: Idempotência de agregações**

Para mesmos inputs (organId, from, to):

- 2 chamadas sucessivas retornam o mesmo output
- Se cache está frio ou quente, resultado é idêntico
- Se rodadas em paralelo, resultado é idêntico

### E2E Playwright

`prefeitura-flows.spec.ts`:

```
1. Login gestor → /prefeitura → sidebar "Início" ativo
2. Click "KPIs" → activeView muda, card KPIs renderiza
3. Click "Escalas" → grid semanal aparece
4. Click "Frequência" → tabela + filtros
5. Click "Realtime" → cards de UPAs
6. /prefeitura sem login → redirect /login
7. Route guard: gestor tenta /admin → redirect /dashboard
```

`prefeitura-tv.spec.ts`:

```
1. Login → /prefeitura/tv → fullscreen dark renderiza
2. Wait 12s → observa que um novo fetch aconteceu (via network intercept)
3. Simular 401 (mock) → detecta redirect pra login
```

### k6

`tests/k6/flows/prefeitura-read.js` — fluxo do gestor lendo home,
KPIs, frequência, realtime.

`tests/k6/scenarios/prefeitura-smoke.js` — 1 VU, 30s. Reutiliza
thresholds default.

## Cache strategy

Chaves no Redis (prefixo `plantonhub:prefeitura:`):

- `dashboard:{organId}` — TTL 30s
- `kpis:{organId}:{fromIsoDate}:{toIsoDate}` — TTL 60s
- `clinics:{organId}` — TTL 5min
- `frequency:{organId}:{fromIsoDate}:{toIsoDate}:{clinicId?}` — TTL 60s
- `absences:{organId}:{fromIsoDate}:{toIsoDate}:{type?}` — TTL 60s
- `realtime:{organId}` — TTL 15s
- `scope:{organId}` — TTL 5min (lista de descendentes)

Sem invalidação cirúrgica — tudo com TTL curto, aceita staleness.

Fallback Redis: se cair, o `RedisCacheService` (fail-open já existente)
faz miss e a query vai direto no Postgres. Sem impacto além de
latência.

## Error Handling

- **Gestor sem organ atribuído** — endpoint retorna 403 com corpo
  `{ "code": "NO_ORGAN_CONTEXT" }`. Frontend mostra tela de "conta
  não configurada, contate o admin".
- **Ausência fora de scope no Acionar OS** — 404 (não vazamos que o
  recurso existe em outro organ).
- **Rate limit atingido** — 429 com header `Retry-After` em segundos.
- **Cognito Lambda offline** — falha graciosa via DB fallback do
  middleware; nenhuma request é rejeitada.
- **Redis offline** — falha graciosa via `RedisCacheService` (fail-open
  existente); requests batem no DB direto, mais lentas mas funcionais.
- **Exports > 5MB** — 413 com mensagem em pt-BR pedindo pra reduzir
  filtros. Não retorna binário parcial.
- **PDF generation crash** — try/catch no `ReportService`, retorna 500
  com mensagem genérica + log estruturado da causa (não expõe stack
  trace ao cliente).

## Testing Strategy

Backend (paridade com Admin OS):

- **Unit tests** (`PlantonHub.UnitTests/Prefeitura/`): ~62 testes
  cobrindo `PrefeituraService`, `TenantService`, middleware, policy
  e `ReportService`.
- **Property tests** (`PlantonHub.PropertyTests/Prefeitura/`):
  5 propriedades — isolamento por organ, hierarquia recursiva,
  idempotência de agregações, geração determinística de PDF/Excel
  para mesmos inputs.
- **Integration tests** (`PlantonHub.IntegrationTests/Prefeitura/`):
  10 cenários com Testcontainers + Cognito real, incluindo happy
  path completo (login → dashboard → export PDF → acionar OS).

Frontend:

- **Vitest**: 12 arquivos, ~215 testes. Um por página + modal
  AcionarOs + helpers de download.
- **Playwright**: `prefeitura-flows.spec.ts` com 9 smokes +
  `prefeitura-tv.spec.ts` com 3 testes de polling.

Performance:

- **k6**: `prefeitura-smoke.js` reusa infra existente, mira em p95 <
  500ms para reads e p95 < 3000ms para exports (geração de binário
  é mais lenta).

## Correctness Properties

As 5 propriedades formais que o `PlantonHub.PropertyTests/Prefeitura/`
deve validar via FsCheck.

### Property 1: Isolamento por organ

Dado o token de `gestor(A)`, nenhuma response de qualquer endpoint
contém dados vinculados a organs fora do scope de A (root + descendentes
transitivos de A). Verificado via `fast-check` que gera dois organs
não relacionados, seed em ambos, autentica como gestor(A) e assere
que zero dados de B aparecem em qualquer endpoint.

**Validates: Requirements 3.1, 3.3**

### Property 2: Hierarquia recursiva

Gestor(root) vê união dos dados de root + descendentes transitivos.
Gestor(child) vê apenas o child. Se `child` é descendente de `root`,
então `data(gestor(root)) ⊇ data(gestor(child))`. Se `A` e `B` não
compartilham ancestral, então `data(gestor(A)) ∩ data(gestor(B)) = ∅`.

**Validates: Requirements 3.2, 1.9**

### Property 3: Idempotência de agregações

Para mesmos inputs `(organId, from, to)`, duas chamadas ao
`GET /dashboard`, `GET /kpis` ou `GET /frequency` retornam o mesmo
output. Independente de cache quente/frio ou paralelismo.

**Validates: Requirements 2.1, 2.2, 2.5**

### Property 4: Determinismo do PDF

Para mesmos inputs (mesmo `reportType`, mesmos filtros, mesmo scope),
o mesmo binário PDF é gerado. Comparação por SHA256 do output.
Permite cache futuro pelo hash dos inputs e detecta regressões em
templates que geram output diferente.

**Validates: Requirements 11.1, 11.3**

### Property 5: Determinismo do Excel

Mesma propriedade que Property 4 para `.xlsx`. Comparação
estrutural — como xlsx é ZIP, comparamos o hash de cada entry após
descompactar (timestamps embutidos são normalizados).

**Validates: Requirements 11.1, 11.4**

## Riscos operacionais

### R1. Query de agregação lenta

Se um organ raiz tem 50 subprefeituras × 200 UPAs × 30 dias de
histórico = potencial full scan.

**Mitigação:**

- Índices já existentes cobrem a maioria (Attendance.CheckInTime + Shift.ClinicId_Date da Sprint 1)
- Cache Redis 30-60s absorve rajadas
- Se ficar lento em prod, migrar `absences` e `history` pra queries
  materializadas (view Postgres com refresh diário) — Sprint 8

### R2. Refresh token expira durante TV mode desatendido

Se o device fica offline por >30 dias, o refresh token expira. Ao
voltar online, a próxima chamada retorna 401 e o app pede login.

**Mitigação:**

- Refresh token Cognito default é 30 dias; se necessário aumentar,
  configurar no CDK
- Adicionar logging cliente-side no LogWatch pra detectar refresh
  failures repetidos (indicador de device abandonado)

### R3. Lambda pre-token que injeta claim falha

Se a Lambda começar a retornar erro, o Cognito ainda retorna token mas
sem `publicOrganId`.

**Mitigação:**

- Fallback DB no `TenantMiddleware` já cobre — não bloqueia acesso
- Alarme CloudWatch na Lambda pra alertar equipe
- Testar cenário no integration test (mockar claim ausente)

### R4. Múltiplos organs por gestor

Um gestor pode teoricamente ter roles em vários organs
(UserPublicOrganRole permite via unique composto). Hoje o token só
carrega um `publicOrganId`.

**Escopo desta sprint:** assumir 1:1 gestor→organ. Se o requirement de
multi-organ aparecer, evolui pra:

- Claim vira array `publicOrganIds: [...]`
- Frontend adiciona seletor de organ ativo (similar ao ClinicSelector)
- Endpoints aceitam header `X-Public-Organ-Id`

Fora do escopo agora — anotar como débito e-endereçar quando
justificar.

## Convenções mantidas

- Clean Architecture — services em Application, controllers em API,
  repositórios em Infrastructure
- Padrão de policies em `AuthorizationExtensions.cs`
- Padrão de state-based navigation do `AdminPage`
- CSS modules por página
- i18n com namespace `prefeitura.*`
- Testes em `tests/PlantonHub.UnitTests/` na estrutura de pastas
  `Services/`, `Controllers/`, `Middleware/`
- Testes property em `tests/PlantonHub.PropertyTests/Prefeitura/`
- Testes integration em `tests/PlantonHub.IntegrationTests/Prefeitura/`
- Vitest test files ao lado dos componentes (`__tests__/`)
- Playwright specs em `frontend/e2e/`
- k6 flows em `tests/k6/flows/`, scenarios em `tests/k6/scenarios/`

## Não faz parte deste design

- Justificativas, aprovações ou correções via portal Prefeitura (Admin OS)
- Exportação de relatórios em PDF/Excel (adicionar depois se pedido)
- Notificações push para o gestor (a operação já é assíncrona)
- Chat / comentários em eventos (nunca esteve nos mocks)
- Configuração de contratos via portal (Admin OS)

Cada item acima entra em spec separada quando necessário.

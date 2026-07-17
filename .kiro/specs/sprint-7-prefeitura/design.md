# Design: Portal Prefeitura

## Sumário

Portal read-only para o gestor público (GestorPublico) acompanhar as
UPAs que ele contratou via `Contract`. Aproveita 90% do modelo de dados
já existente e adiciona uma nova entity de junção
(`UserPublicOrganRole`), um novo role, uma nova policy e um novo bloco
de endpoints `/api/prefeitura/*` filtrados por escopo hierárquico.

Frontend com layout próprio (sidebar state-based, similar ao
`AdminPage`) mais um modo TV fullscreen para display de monitoramento.

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

### D5. Sem escrita = sem serviços mutáveis

Portal Prefeitura é **puramente de leitura**. Não haverá:

- Endpoints POST/PUT/DELETE em `/api/prefeitura/*`
- Justificativas ou aprovações via portal (fica no Admin OS)
- Correção de check-in errado (fica no Admin OS)

Vantagens:

- Nenhuma escrita significa nenhum audit interceptor para `PrefeituraService`
- Cache Redis com TTL longo (30-60s) sem preocupação de invalidação
  cirúrgica — se um dado mudou, o gestor vê 30s depois. Aceitável para
  fiscalização.

## Modelo de dados

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

## Autenticação e autorização

### Fluxo de login (Cognito + claim)

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

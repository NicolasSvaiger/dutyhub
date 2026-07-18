# DutyHub / PlantonHub

Sistema de gestão de plantões médicos: profissionais registram presença
(check-in/check-out com geolocalização, biometria facial e sync offline),
administradores gerenciam escalas, contratos e faturamento. Multi-tenant
por clínica, RBAC, autenticação via AWS Cognito.

## Arquitetura

**Clean Architecture** com 4 camadas:

| Camada | Responsabilidade |
|--------|------------------|
| **Domain** | Entidades, enums, interfaces de repositório |
| **Application** | Serviços, DTOs, validadores, interfaces |
| **Infrastructure** | EF Core, repositórios, cache Redis, Cognito, seed |
| **API** | Controllers, middlewares, config, Program.cs |

**Stack:** .NET 8 + React (TypeScript) + Flutter (mobile) + PostgreSQL 16 +
Redis 7 + AWS (Cognito, App Runner, RDS, ElastiCache, S3/CloudFront).

## Estrutura

```
DutyHub/
├── src/
│   ├── PlantonHub.Domain/              # Entidades, enums, interfaces
│   ├── PlantonHub.Application/         # Services, DTOs, validators
│   ├── PlantonHub.Infrastructure/      # EF Core, repos, cache, Cognito
│   └── PlantonHub.API/                 # Controllers, middlewares, Program.cs
├── frontend/                           # React SPA (Vite + TS) — ver frontend/README.md
├── infrastructure/                     # CDK stacks (network, database, api, dns, cognito, ...)
├── tests/
│   ├── PlantonHub.UnitTests/           # xUnit + Moq (440 testes)
│   ├── PlantonHub.PropertyTests/       # FsCheck (65 testes)
│   ├── PlantonHub.IntegrationTests/    # Testcontainers + Cognito real
│   └── k6/                             # Load / stress tests — ver tests/k6/README.md
├── docs/                               # Docs de integração (Flutter biometric API, reunião 24p7)
├── .github/workflows/
│   ├── ci.yml                          # Backend + frontend tests + build + deploy
│   └── perf.yml                        # k6 load smoke (manual)
├── docker-compose.yml
├── Dockerfile                          # API .NET 8 multi-stage
└── frontend/Dockerfile                 # Frontend Node build + Nginx
```

## Pré-requisitos

### Com Docker (recomendado para dev)

- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/)
- Credenciais AWS Cognito (variáveis de ambiente ou secrets) — o Cognito real
  é usado até em dev, não há mock local.

### Sem Docker

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 20+](https://nodejs.org/)
- [PostgreSQL 16](https://www.postgresql.org/download/) + [Redis 7](https://redis.io/download)

## Executar

### Docker Compose

```bash
docker compose up --build
```

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:5000 |
| Swagger | http://localhost:5000/swagger |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

Migrations e seed rodam automaticamente no startup da API. A stack sobe
com health checks — `docker compose up --wait` bloqueia até tudo ficar
saudável.

### Modo dev separado

Backend:

```bash
# 1. Postgres + Redis via Docker
docker compose up -d db redis

# 2. Migrations
dotnet ef database update \
  --project src/PlantonHub.Infrastructure \
  --startup-project src/PlantonHub.API

# 3. API
dotnet run --project src/PlantonHub.API
```

Frontend: ver [`frontend/README.md`](frontend/README.md).

## Migrations EF Core

```bash
# Nova migration
dotnet ef migrations add <Nome> \
  --project src/PlantonHub.Infrastructure \
  --startup-project src/PlantonHub.API

# Aplicar
dotnet ef database update \
  --project src/PlantonHub.Infrastructure \
  --startup-project src/PlantonHub.API

# Reverter última
dotnet ef migrations remove \
  --project src/PlantonHub.Infrastructure \
  --startup-project src/PlantonHub.API
```

## Dados de acesso (Cognito)

Autenticação via AWS Cognito. Usuários seedados no User Pool:

| Email | Senha | Perfil | Clínicas |
|-------|-------|--------|----------|
| admin@plantonhub.com | Admin@123 | AdminGlobal | Todas |
| adminclinica@plantonhub.com | Teste@123 | AdminClinica | Clínica Alpha |
| medico@plantonhub.com | Teste@123 | Medico | Alpha + Beta |
| enfermeiro@plantonhub.com | Teste@123 | Enfermeiro | Clínica Alpha |
| gestor@plantonhub.com | Teste@123 | GestorPublico | Prefeitura Municipal de Santo André |

O backend recebe o ID Token como Bearer. Claims customizados (`roles`,
`clinicIds`) são injetados pela Lambda pre-token-generation.

**Clínicas seedadas:** Clínica Alpha (principal), Clínica Beta (para
multi-tenancy).

## Testes

Baseline atual: **527 unit + 72 property + ~45 integration + 661 vitest
+ Playwright E2E** (auth + doctor-flow + prefeitura-flows +
prefeitura-tv).

### Backend

```bash
# Unit (Moq, roda local sem infra)
dotnet test tests/PlantonHub.UnitTests

# Property (FsCheck)
dotnet test tests/PlantonHub.PropertyTests

# Integration (Testcontainers + Cognito real — roda só no CI ou com AWS creds locais)
dotnet test tests/PlantonHub.IntegrationTests
```

### Frontend

Unit + component (Vitest):

```bash
cd frontend
npx vitest --run
```

E2E (Playwright — requer Docker + Cognito real):

```bash
docker compose up -d --wait --build
cd frontend
npx playwright test
```

### Performance (k6)

Load smokes contra os hot paths do profissional. Rodam manualmente via
GitHub Actions ou local. Ver [`tests/k6/README.md`](tests/k6/README.md).

Trigger no CI: **Actions → Performance / Load smoke → Run workflow**.
Escolha o cenário (`smoke.js`, `load.js`, `stress.js`,
`checkin-cycle.js`, `prefeitura-smoke.js`) e opcionalmente aponte para
staging via `base_url`.

## CI/CD

`.github/workflows/ci.yml` roda em push/PR para `main`:

- Backend unit tests → 527 testes
- Backend property tests → 72 testes
- Backend integration tests (Testcontainers + Cognito — pula em PRs do
  Dependabot, que não veem secrets)
- Frontend unit tests (Vitest) → 661 testes
- Frontend E2E (Playwright — pula em Dependabot)
- Build & push das imagens para ECR (só na `main`)
- Deploy no App Runner (só na `main`)
- Trivy container scan (só na `main`, soft-fail com SARIF no Code Scanning)
- Deploy frontend para S3 + invalidate CloudFront

`.github/workflows/perf.yml` é manual — dispatch com escolha de cenário.

`.github/dependabot.yml` agrupa updates por família (aspnetcore-and-ef,
serilog, aws, testing no backend; react-and-router, vitest-and-testing,
i18n, types-and-tooling no frontend). Majors de framework críticos
(EF Core, ASP.NET, Npgsql, AWSSDK, React, Vite, TypeScript, Vitest)
ficam no `ignore` — upgrade só via sprint dedicada.

## Offline First — check-in / check-out

O médico consegue registrar check-in/check-out mesmo sem internet. O
fluxo é offline-first: ação salva local, sync quando conectividade volta.

### Fluxo

```
1. Usuário toca check-in/check-out
2. Frontend detecta offline (navigator.onLine === false ou erro de rede)
3. Evento salvo em localStorage com status "Pending"
4. Ao voltar online (evento window.online), useOfflineSync envia todos
   os pendentes via POST /api/attendance/sync
5. Backend processa cada evento e retorna status individual
6. Eventos sincronizados são removidos da fila local
```

### Campos do evento offline

| Campo | Descrição |
|-------|-----------|
| `localEventId` | UUID gerado no dispositivo (garante idempotência) |
| `localDateTime` | Horário do dispositivo no momento da ação |
| `latitude` / `longitude` | Coordenadas GPS |
| `deviceId` | Identificador único do dispositivo |
| `biometricValidated` | Se a biometria foi validada localmente |
| `syncStatus` | Pending, Synced ou Failed |
| `retryCount` | Número de tentativas de sincronização |

### Status após sync

| Status | Significado |
|--------|-------------|
| `OnlineSynced` | Registrado online em tempo real (sem fila) |
| `OfflineSynced` | Registrado offline e sincronizado com sucesso |
| `OfflineSyncedLate` | Sincronizado com atraso significativo |
| `RequiresReview` | Aceito mas com alertas — requer revisão manual |
| `Rejected` | Rejeitado por falha de validação |
| `DuplicateIgnored` | Evento duplicado já processado |

### Quando um evento vira `RequiresReview`

Detecta flags antifraude:

- Evento muito antigo (`localDateTime` distante do server time)
- Clock skew excessivo entre device e servidor
- Localização GPS fora do raio permitido da clínica
- DeviceId incomum para o usuário
- Biometria não validada localmente
- `AppVersion` desatualizada
- Múltiplos reenvios do mesmo `localEventId` (possível replay attack)

Um administrador revisa esses eventos em Admin OS → Auditoria.

### Redis no fluxo offline

Redis **não** é fonte da verdade — PostgreSQL mantém esse papel. Redis
atua em três pontos e todos falham-abertos:

| Uso | Fallback se Redis cair |
|-----|------------------------|
| Lock distribuído (evita race no sync de mesmo user/plantão) | Operação prossegue sem lock (dedupe cai para índice único no DB) |
| Idempotência temporária (TTL curto para reenvios rápidos) | Verificação cai para índice único (`localEventId + userId + deviceId`) |
| Rate limit por user/device | Rate limit não é aplicado, operação prossegue |

### Testar modo offline

Chrome/Edge DevTools:

1. `F12` → Network → checkbox "Offline"
2. Fazer check-in — enfileira local
3. Desmarcar "Offline" — sync automático dispara

Via código (útil em testes automáticos):

```javascript
window.dispatchEvent(new Event('offline'));
// ... realizar ação ...
window.dispatchEvent(new Event('online')); // dispara sync
```

## Portal Prefeitura

Portal separado para gestores de órgãos públicos que contrataram uma OS
para operar UPAs. Read-only sobre os dados operacionais das clínicas
vinculadas ao seu contrato, com uma única mutação (Acionar OS) para
sinalizar ausências críticas.

### Rotas

| Rota | Acesso | Descrição |
|------|--------|-----------|
| `/prefeitura/login` | Público | Login separado (Cognito SDK, layout hero+form) |
| `/prefeitura` | `GestorPublico` | Portal com sidebar + 8 sub-views (state-based) |
| `/prefeitura/tv` | `GestorPublico` | Modo TV fullscreen para display em telão |

### Sub-views (state-based, activeView)

Início, Indicadores (KPIs), Escalas, Frequência, Atrasos, Ausências,
Histórico (paginado, com export PDF/XLSX), Tempo Real (polling 30s).

### Modelo de auth

Nova entidade `UserPublicOrganRole(UserId, PublicOrganId, Role)` +
role `GestorPublico` no `RoleType`. A Lambda pre-token-generation
(quando disponível) injeta o claim `publicOrganId` no ID Token; sem
ela, o `TenantMiddleware` faz fallback via DB. Hierarquia
parent/child de `PublicOrgan` permite um gestor de raiz ver
descendentes recursivamente (`GetDescendantIdsAsync`).

### Acionar OS

Coluna "Ação" na view Ausências abre um modal de confirmação que chama
`POST /api/prefeitura/absences/{id}/notify-os`. O backend delega ao
`IAlertsService.CreateAsync` — o alerta aparece no Admin OS para a
equipe operacional agir. Rate limit dedicado (5/min por user) via
policy `PrefeituraNotifyOs`.

### Export PDF/XLSX

`GET /api/prefeitura/reports/{reportType}/export?format=pdf|xlsx` gera
o binário no backend (QuestPDF para PDF, ClosedXML para Excel) e o
frontend baixa via `<a download>` respeitando `Content-Disposition`.
Rate limit 10/min via policy `PrefeituraExport`. Rejeita payloads
> 5 MB com 413.

Guia funcional completo: [`docs/portal-prefeitura.md`](docs/portal-prefeitura.md).

## Biometria facial

Verificação facial no check-in usa embeddings 128-dim
(FaceNet/MobileFaceNet). Processamento de imagem ocorre no device
(Flutter/web); o backend armazena e compara via cosine similarity.

### Fluxo

```
Device → captura selfie → gera embedding (128-dim)
      → POST /api/biometric/verify → backend compara com o enrolled
      → se match (cosine >= 0.6): permite check-in
```

### Endpoints

| Método | Endpoint | Descrição | Acesso |
|--------|----------|-----------|--------|
| GET | `/api/biometric/status` | Verifica se tem enrollment | Profissional |
| POST | `/api/biometric/enroll/me` | Self-enrollment | Profissional |
| DELETE | `/api/biometric/enroll/me` | Deletar enrollment (LGPD) | Profissional |
| POST | `/api/biometric/verify` | Verificar no check-in | Profissional |
| POST | `/api/biometric/enroll/{userId}` | Admin cadastra face | AdminClinica |
| POST | `/api/biometric/re-enroll/{userId}` | Recadastrar | AdminClinica |
| GET | `/api/biometric/enrollments/{userId}` | Auditoria de enrollments | AdminClinica |

Guia completo para o app Flutter: [`docs/flutter-biometric-api.md`](docs/flutter-biometric-api.md).

## Auditoria

Duas fontes:

- **`AuditSaveChangesInterceptor`** — interceptor do EF Core que grava em
  `AuditLogs` toda operação CUD em entidades whitelisted (User, Clinic,
  Shift, Contract, PublicOrgan, Substitution, Justification, Alert,
  FaceEnrollment, DeviceRegistration, ClinicShiftTemplate,
  UserClinicRole, SystemSettings). Skipa `PasswordHash` e `Embedding`
  para não vazar dados sensíveis.
- **`IAuditService.LogAsync`** — chamadas explícitas em eventos não-CUD:
  login (via face-login), logout (via blacklist do JWT). O `LogAsync`
  aceita `userId` explícito para casos em que o `HttpContext` ainda não
  tem o token (login flow).

Admin OS → Auditoria consome esses dados via
`GET /api/audit` (AdminGlobal only, paginação + filtros).

## Infraestrutura AWS

Stacks CDK em `infrastructure/lib/`:

| Stack | Serviço | Uso |
|-------|---------|-----|
| `network-stack` | VPC, subnets, SGs | Rede base |
| `database-stack` | RDS PostgreSQL | Banco principal (backup 30d, multi-AZ, deletionProtection) |
| `api-stack` | App Runner | API .NET 8 |
| `cognito-stack` | Cognito User Pool + App Client + pre-token Lambda | Auth |
| `ecr-stack` | ECR | Imagens Docker |
| `frontend-stack` | S3 + CloudFront | SPA estático |
| `dns-stack` | Route 53 | DNS |
| `secrets-stack` | Secrets Manager | Connection strings |

**Domínios de produção:**
- API: `api.laulab.com.br`
- Frontend: via CloudFront distribution

## Documentação adicional

- [`frontend/README.md`](frontend/README.md) — SPA, roteamento, testes vitest/Playwright
- [`tests/k6/README.md`](tests/k6/README.md) — Load testing com k6
- [`docs/flutter-biometric-api.md`](docs/flutter-biometric-api.md) — API de biometria para Flutter
- [`docs/reuniao-integracao-24p7.md`](docs/reuniao-integracao-24p7.md) — Alinhamento de integração do app 24p7

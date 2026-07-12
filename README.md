# PlantonHub

Sistema de gestão de plantões médicos (MVP) que permite a profissionais de saúde gerenciarem escalas, registrarem presença (check-in/check-out com geolocalização) e manterem histórico de atividades. O sistema é multi-tenant por clínica, com controle de acesso baseado em papéis (RBAC) e autenticação JWT.

## Arquitetura

O projeto segue **Clean Architecture** com 4 camadas:

| Camada | Responsabilidade |
|--------|-----------------|
| **Domain** | Entidades, enums e interfaces de repositório |
| **Application** | Serviços, DTOs, validadores e interfaces de aplicação |
| **Infrastructure** | EF Core, repositórios concretos, JWT, hash de senha |
| **API** | Controllers, middlewares, configuração e Program.cs |

**Stack tecnológica:** .NET 8 + React (TypeScript) + Flutter (mobile) + PostgreSQL + AWS (Cognito, App Runner, RDS, S3/CloudFront)

## Estrutura de Diretórios

```
PlantonHub/
├── src/
│   ├── PlantonHub.Domain/           # Entidades, enums, interfaces de repositório
│   ├── PlantonHub.Application/      # Serviços, DTOs, validadores
│   ├── PlantonHub.Infrastructure/   # EF Core, repositórios, JWT, seed
│   └── PlantonHub.API/              # Controllers, middlewares, Program.cs
├── frontend/                        # React SPA (Vite + TypeScript)
│   └── src/
│       ├── api/                     # Axios instance e chamadas à API
│       ├── contexts/                # AuthContext, ClinicContext
│       ├── pages/                   # Páginas da aplicação
│       ├── components/              # Componentes reutilizáveis
│       ├── hooks/                   # Custom hooks
│       └── types/                   # Tipos TypeScript
├── tests/
│   ├── PlantonHub.UnitTests/        # Testes unitários (xUnit)
│   ├── PlantonHub.PropertyTests/    # Testes de propriedade (FsCheck)
│   └── PlantonHub.IntegrationTests/ # Testes de integração
├── docker-compose.yml
├── Dockerfile                       # API (.NET 8 multi-stage)
└── frontend/Dockerfile              # Frontend (Node build + Nginx)
```

## Pré-requisitos

### Com Docker (recomendado)

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Sem Docker (desenvolvimento local)

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 20+](https://nodejs.org/)
- [PostgreSQL 16](https://www.postgresql.org/download/)

## Executar com Docker

```bash
docker-compose up --build
```

Após a inicialização, acesse:

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:5000 |
| Swagger | http://localhost:5000/swagger |

> As migrations e o seed de dados são executados automaticamente ao iniciar a API.

## Executar Localmente

### 1. Iniciar o PostgreSQL

Certifique-se de que o PostgreSQL está rodando na porta 5432 com as credenciais padrão:

- **Database:** plantonhub
- **Usuário:** postgres
- **Senha:** postgres

### 2. Aplicar migrations

```bash
dotnet ef database update --project src/PlantonHub.Infrastructure --startup-project src/PlantonHub.API
```

### 3. Executar a API

```bash
dotnet run --project src/PlantonHub.API
```

A API estará disponível em `http://localhost:5000` com Swagger em `http://localhost:5000/swagger`.

### 4. Executar o frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend estará disponível em `http://localhost:5173` (Vite dev server).

## Migrations

### Adicionar uma nova migration

```bash
dotnet ef migrations add <NomeDaMigration> --project src/PlantonHub.Infrastructure --startup-project src/PlantonHub.API
```

### Atualizar o banco de dados

```bash
dotnet ef database update --project src/PlantonHub.Infrastructure --startup-project src/PlantonHub.API
```

### Reverter última migration

```bash
dotnet ef migrations remove --project src/PlantonHub.Infrastructure --startup-project src/PlantonHub.API
```

## Dados de Acesso (Cognito)

A autenticacao e feita via AWS Cognito. Os usuarios de teste abaixo estao no User Pool:

| Email | Perfil | Clinicas |
|-------|--------|----------|
| admin@plantonhub.com | AdminGlobal | Todas |
| adminclinica@plantonhub.com | AdminClinica | Clinica Alpha |
| medico@plantonhub.com | Medico | Clinica Alpha |
| enfermeiro@plantonhub.com | Enfermeiro | Clinica Alpha |

> Login via Cognito SDK (frontend/mobile). O backend recebe o ID Token como Bearer.  
> Claims customizados (`roles`, `clinicIds`) sao injetados pela Lambda pre-token-generation.

**Clínicas criadas pelo seed:**

- **Clínica Alpha** — clínica principal com usuários associados
- **Clínica Beta** — clínica secundária para testes de multi-tenancy

## Testes

Executar todos os testes da solution:

```bash
dotnet test PlantonHub.sln
```

Executar apenas testes unitários:

```bash
dotnet test tests/PlantonHub.UnitTests
```

Executar apenas testes de propriedade:

```bash
dotnet test tests/PlantonHub.PropertyTests
```

## Offline First — Check-in/Check-out

O PlantonHub suporta operações de check-in e check-out mesmo quando o dispositivo está sem internet. O fluxo é baseado na estratégia **offline-first**: a ação do usuário é registrada localmente e sincronizada com o servidor assim que a conectividade for restaurada.

### Fluxo Geral

```
1. Usuário faz check-in/check-out no dispositivo
2. Frontend detecta que está offline (navigator.onLine === false ou falha de rede)
3. Evento é salvo no localStorage com status "Pending"
4. Quando a internet retorna (evento "online"), o hook useOfflineSync envia todos os eventos pendentes via POST /api/attendance/sync
5. Backend processa cada evento e retorna o resultado individual
6. Eventos sincronizados são removidos da fila local
```

### Campos do Evento Offline

Cada evento armazenado localmente contém:

| Campo | Descrição |
|-------|-----------|
| `localEventId` | UUID gerado no dispositivo (garante idempotência) |
| `localDateTime` | Horário do dispositivo no momento da ação |
| `latitude` / `longitude` | Coordenadas GPS |
| `deviceId` | Identificador único do dispositivo |
| `biometricValidated` | Se a biometria foi validada localmente |
| `syncStatus` | Pending, Synced ou Failed |
| `retryCount` | Número de tentativas de sincronização |

### Status de Sincronização

Após o sync, cada evento recebe um dos seguintes status:

| Status | Significado |
|--------|-------------|
| `OnlineSynced` | Registrado online em tempo real (sem fila) |
| `OfflineSynced` | Registrado offline e sincronizado com sucesso |
| `OfflineSyncedLate` | Sincronizado com atraso significativo |
| `RequiresReview` | Aceito mas com alertas — requer revisão manual |
| `Rejected` | Rejeitado por falha de validação |
| `DuplicateIgnored` | Evento duplicado já processado anteriormente |

### Quando um evento recebe `RequiresReview`

O sistema marca um evento para revisão manual quando detecta condições suspeitas (flags antifraude):

- **Evento muito antigo** — o `localDateTime` indica que se passaram muitas horas desde a ação original
- **Clock skew excessivo** — grande diferença entre o horário do dispositivo e o horário do servidor (ver seção abaixo)
- **Localização fora do raio** — coordenadas GPS fora do raio permitido da clínica
- **DeviceId incomum** — dispositivo diferente do habitualmente utilizado pelo usuário
- **Biometria não validada** — o dispositivo não confirmou biometria local
- **AppVersion desatualizada** — versão do app abaixo do mínimo aceitável
- **Múltiplos reenvios** — tentativas repetidas do mesmo evento (possível replay attack)

Um administrador pode revisar estes eventos no painel de auditoria.

### Clock Skew — Horário Local vs. Horário do Servidor

O sistema registra dois timestamps para cada operação:

- **`LocalDateTime`** — horário do dispositivo no momento do check-in/check-out
- **`ServerDateTime`** — horário do servidor no momento em que recebeu o evento

A diferença entre esses dois valores é o **clock skew**. Quando a diferença é muito grande, o evento é marcado como `RequiresReview` porque pode indicar:

- Relógio do dispositivo desconfigurado (intencional ou acidental)
- Evento registrado offline há muito tempo e sincronizado com atraso
- Tentativa de fraude (alterar o horário do dispositivo para registrar presença retroativamente)

```
Exemplo:
  LocalDateTime:  2024-03-15 08:00:00 (dispositivo)
  ServerDateTime: 2024-03-15 14:30:00 (servidor)
  Diferença:      6h30 → marcado como RequiresReview
```

### Como o Redis Participa do Fluxo Offline

O Redis **não** é a fonte da verdade — o PostgreSQL mantém esse papel. O Redis atua em três pontos específicos durante a sincronização:

| Uso | Descrição | Comportamento se Redis indisponível |
|-----|-----------|-------------------------------------|
| **Lock distribuído** | Evita race conditions quando dois dispositivos sincronizam o mesmo usuário/plantão simultaneamente | Operação prossegue sem lock (possível duplicata tratada pela idempotência do banco) |
| **Idempotência temporária** | Cache de curta duração (TTL) para detectar reenvios imediatos do mesmo `localEventId` | Verificação de idempotência cai para o índice único do PostgreSQL |
| **Rate limit** | Limita a quantidade de syncs por usuário/dispositivo em um intervalo de tempo | Rate limit não é aplicado, operação prossegue |

O design **fail-open** garante que o fluxo de sincronização nunca é bloqueado pela indisponibilidade do Redis.

### Como Testar Modo Offline

#### Via DevTools do Navegador (Chrome/Edge)

1. Abra DevTools (`F12` ou `Ctrl+Shift+I`)
2. Vá até a aba **Network**
3. Marque a checkbox **Offline** (ou selecione "Offline" no dropdown de throttling)
4. Realize um check-in — o evento será enfileirado localmente
5. Desmarque "Offline" — o sync acontece automaticamente

#### Via Network Throttling

1. No DevTools → Network, selecione um perfil como **Slow 3G** ou **Offline**
2. Útil para simular conexões instáveis onde requests podem falhar por timeout

#### Verificando Eventos Pendentes

- Um banner visual aparece quando o dispositivo está offline
- Um indicador mostra a quantidade de operações pendentes
- A lista de eventos pendentes é acessível na interface do usuário
- O botão "Sincronizar" permite forçar o envio manualmente

#### Via Código (para testes automatizados)

```javascript
// Simular offline
window.dispatchEvent(new Event('offline'));

// Simular volta ao online (dispara sync automático)
window.dispatchEvent(new Event('online'));
```

## Tecnologias

| Categoria | Tecnologia |
|-----------|------------|
| Backend | .NET 8, ASP.NET Core Web API |
| ORM | Entity Framework Core |
| Banco de Dados | PostgreSQL 16 |
| Cache Distribuído | Redis 7 (Alpine) |
| Autenticação | AWS Cognito (JWT ID Token + pre-token Lambda) |
| Validação | FluentValidation |
| Frontend | React 18, TypeScript, Vite |
| Mobile | Flutter (em desenvolvimento) |
| HTTP Client | Axios |
| Roteamento | React Router |
| Testes | xUnit, FsCheck, Moq, FluentAssertions, fast-check |
| Containerização | Docker, Docker Compose |
| Documentação API | Swagger / OpenAPI |
| Infra (AWS) | App Runner, RDS PostgreSQL, ElastiCache Redis, Cognito, Secrets Manager, CloudFront + S3 |
| Biometria | FaceNet/MobileFaceNet (embeddings 128-dim, cosine similarity) |

## Biometria Facial (Sprint 3)

O sistema utiliza verificacao facial para garantir que o profissional que faz check-in e realmente quem diz ser. O processamento de imagem ocorre no dispositivo (Flutter), e o backend armazena e compara os embeddings.

### Fluxo

```
App Flutter → captura selfie → gera embedding (MobileFaceNet 128-dim)
           → POST /api/biometric/verify → backend compara via cosine similarity
           → se match (>= 0.6): permite check-in
```

### Endpoints de Biometria

| Método | Endpoint | Descrição | Acesso |
|--------|----------|-----------|--------|
| GET | `/api/biometric/status` | Verifica se usuario tem enrollment | Profissional |
| POST | `/api/biometric/enroll/me` | Self-enrollment da face | Profissional |
| DELETE | `/api/biometric/enroll/me` | Deletar enrollment (LGPD) | Profissional |
| POST | `/api/biometric/verify` | Verificar face no check-in | Profissional |
| POST | `/api/biometric/enroll/{userId}` | Admin cadastra face | AdminClinica |
| POST | `/api/biometric/re-enroll/{userId}` | Recadastrar face | AdminClinica |
| GET | `/api/biometric/enrollments/{userId}` | Listar enrollments (auditoria) | AdminClinica |

### Documentação para Dev Flutter

Consulte [`docs/flutter-biometric-api.md`](docs/flutter-biometric-api.md) para o guia completo de integração.

## Infraestrutura AWS

| Serviço | Uso |
|---------|-----|
| **App Runner** | Hospeda a API .NET 8 |
| **RDS PostgreSQL** | Banco de dados principal |
| **ElastiCache Redis** | Cache + locks distribuidos + rate limiting |
| **Cognito** | Autenticação (User Pool + pre-token Lambda) |
| **Secrets Manager** | Connection strings (DB, Redis) |
| **S3 + CloudFront** | Frontend React (SPA estático) |

**Domínios:**
- API: `api.laulab.com.br`
- Frontend: via CloudFront distribution

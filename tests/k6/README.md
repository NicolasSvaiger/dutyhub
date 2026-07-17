# Testes de performance (k6)

Scripts de load testing usando [Grafana k6](https://k6.io) contra a API do PlantonHub.

## Estrutura

```
tests/k6/
├── config.js                # BASE_URL, credenciais de teste, Cognito, thresholds
├── lib/
│   └── auth.js              # login via Cognito USER_PASSWORD_AUTH + headers
├── flows/
│   └── doctor-read.js       # fluxo de leitura reutilizável (clínicas, plantões, histórico)
└── scenarios/
    ├── smoke.js             # sanidade rápida (1 VU, 30s) — rode antes de deploy
    ├── load.js              # carga esperada (~30 VUs por ~3min)
    ├── stress.js            # sobe até 200 VUs para achar o breaking point
    └── checkin-cycle.js     # ciclo completo check-in/check-out (escrita, 1 VU)
```

## Autenticação

O k6 fala **direto com o AWS Cognito** (endpoint `USER_PASSWORD_AUTH` do
User Pool) — o mesmo caminho que o frontend usa via
`amazon-cognito-identity-js`. Não passa pelo `/auth/login` do backend
(esse endpoint foi removido na Sprint 2, migração da auth para Cognito).

Isso significa que o token que chega no backend é um ID Token real do
Cognito, exercitando o mesmo pipeline de validação que produção vê. O
JWT claim `clinicIds` (injetado pelo Lambda pre-token-generation) é
lido no `lib/auth.js` para popular o header `X-Clinic-Id`.

## Rodar em CI (recomendado)

Actions → **Performance / Load smoke** → **Run workflow**. Escolha o
cenário no dropdown (`smoke.js`, `load.js`, `stress.js`,
`checkin-cycle.js`) e opcionalmente aponte para outro `base_url`
(staging, prod). O workflow:

1. Sobe o stack local (`docker compose up --wait --build`) se `base_url`
   estiver vazio, ou testa contra o URL informado sem subir stack.
2. Roda o cenário escolhido.
3. Publica um step summary com totais + taxa de sucesso + p95/p99.
4. Sobe o `summary.json` completo como artifact (retenção 14 dias).

Failures de threshold fazem o workflow falhar — regressão de perf
bloqueia deploy.

## Rodar localmente

### Pré-requisitos

- **k6 instalado** — https://k6.io/docs/get-started/installation/
  - Windows (chocolatey): `choco install k6`
  - macOS (brew): `brew install k6`
- **Docker Desktop rodando** — para subir a API.
- **Cognito App Client ID** — mesmo secret que o CI usa (peça ao admin do
  projeto ou pegue do secret manager).

### Comandos

```bash
# 1. Sobe o stack local
docker compose up -d --wait --build

# 2. Roda o smoke test
COGNITO_CLIENT_ID=<app-client-id> \
BASE_URL=http://localhost:5000/api \
  k6 run tests/k6/scenarios/smoke.js
```

### Sobrescrever configuração

Variáveis de ambiente aceitas:

```bash
BASE_URL=https://staging.plantonhub.com/api   # override da API
COGNITO_REGION=us-east-1                      # região do User Pool
COGNITO_CLIENT_ID=<obrigatório>               # App Client ID
TEST_EMAIL=outro@exemplo.com                  # override do usuário de teste
TEST_PASSWORD=Senha123
```

### Ajustar carga inline

```bash
# Load com 100 VUs por 5min sem editar o arquivo
COGNITO_CLIENT_ID=<id> k6 run --vus 100 --duration 5m tests/k6/scenarios/load.js
```

### Rodar via Docker (sem instalar k6)

**PowerShell (Windows):**
```powershell
docker run --rm -v "${PWD}/tests/k6:/scripts" `
  -e BASE_URL=http://host.docker.internal:5000/api `
  -e COGNITO_CLIENT_ID=<app-client-id> `
  grafana/k6:latest run /scripts/scenarios/smoke.js
```

**Linux/macOS bash:**
```bash
docker run --rm -v "$(pwd)/tests/k6:/scripts" \
  -e BASE_URL=http://host.docker.internal:5000/api \
  -e COGNITO_CLIENT_ID=<app-client-id> \
  grafana/k6:latest run /scripts/scenarios/smoke.js
```

Ou colocar o container do k6 na mesma network do docker-compose (mais
rápido, sem depender de `host.docker.internal`):

```powershell
docker network ls  # descobre o nome
docker run --rm --network dutyhub_default `
  -v "${PWD}/tests/k6:/scripts" `
  -e BASE_URL=http://api:5000/api `
  -e COGNITO_CLIENT_ID=<app-client-id> `
  grafana/k6:latest run /scripts/scenarios/load.js
```

## SLIs / Thresholds

Definidos em `config.js`:

| Métrica              | Load (default)     | Stress            |
| -------------------- | ------------------ | ----------------- |
| `http_req_failed`    | < 1%               | < 10%             |
| `http_req_duration`  | p95 < 500ms        | p95 < 1500ms      |
|                      | p99 < 1000ms       | p99 < 3000ms      |

Se algum threshold falhar, o k6 sai com código ≠ 0 (workflow fica
vermelho, deploy é bloqueado).

## Lendo o output

Ao final o k6 imprime:

```
http_req_duration.............: avg=127ms  p(95)=284ms  p(99)=612ms
http_req_failed................: 0.00%
http_reqs.....................: 3421   28.5/s
iteration_duration............: avg=1.2s
```

- **avg / p(95) / p(99)** — latência média e percentis.
- **http_req_failed** — taxa de requisições 4xx/5xx ou erro de rede.
- **http_reqs** — throughput total e RPS médio.
- **iteration_duration** — quanto uma iteração completa do fluxo levou.

Cada endpoint tem uma tag `name` (ex: `GET /shifts/me/today`), então
nas métricas por tag dá pra ver qual endpoint está degradado.

## Cenários pré-configurados

### `smoke.js`
Baseline. 1 VU, 30s. Só verifica que nenhum endpoint quebra sob 1
usuário. Rode antes de deploy.

### `load.js`
Cenário nominal. Sobe até 30 VUs em 30s, mantém por 2min, desce em 30s.
Representa ~30 médicos abrindo a home + histórico simultaneamente.

### `stress.js`
Sobe até 200 VUs em degraus (50 → 100 → 200) e segura 2min no pico.
Use para descobrir onde a API começa a degradar antes de ir para
produção.

### `checkin-cycle.js`
Roda 20 iterações do ciclo completo de check-in + check-out para o
médico teste. Rode isoladamente porque a regra "um plantão ativo por
usuário" impede paralelização real com o mesmo user.

## Estendendo

Para adicionar um novo fluxo:

1. Crie um arquivo em `flows/` que exporta uma função recebendo `session`.
2. Crie um cenário em `scenarios/` importando esse fluxo e definindo
   `options` (stages, thresholds).

Para testar concorrência de escrita de verdade, seria preciso seedar N
médicos e distribuir as VUs entre eles no `setup()`.

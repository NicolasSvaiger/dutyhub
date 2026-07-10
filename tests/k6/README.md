# Testes de performance (k6)

Scripts de load testing usando [Grafana k6](https://k6.io) contra a API do PlantonHub.

## Estrutura

```
tests/k6/
├── config.js                # BASE_URL, credenciais de teste, thresholds
├── lib/
│   └── auth.js              # login + montagem de headers autenticados
├── flows/
│   └── doctor-read.js       # fluxo de leitura reutilizável (clínicas, plantões, histórico)
└── scenarios/
    ├── smoke.js             # sanidade rápida (1 VU, 30s) — rode antes de deploy
    ├── load.js              # carga esperada (~30 VUs por ~3min)
    ├── stress.js            # sobe até 200 VUs para achar o breaking point
    └── checkin-cycle.js     # ciclo completo check-in/check-out (escrita, 1 VU)
```

## Pré-requisitos

- **k6 instalado localmente** — https://k6.io/docs/get-started/installation/
  - Windows (chocolatey): `choco install k6`
  - macOS (brew): `brew install k6`
  - Ou baixar o binário direto do site.
- **API rodando** — em `http://localhost:5000` (via `docker-compose up`).
- **Banco seedado** — o `DatabaseSeeder` cria o médico `medico@plantonhub.com` já atribuído a plantões em duas clínicas.

## Como rodar

Na raiz do projeto:

```bash
# Sanity check rápido
k6 run tests/k6/scenarios/smoke.js

# Carga esperada
k6 run tests/k6/scenarios/load.js

# Stress até o limite
k6 run tests/k6/scenarios/stress.js

# Ciclo de escrita (check-in + check-out)
k6 run tests/k6/scenarios/checkin-cycle.js
```

### Sobrescrever configuração

Variáveis de ambiente aceitas:

```bash
# Apontar para outra API
BASE_URL=https://staging.plantonhub.com/api k6 run tests/k6/scenarios/smoke.js

# Usar outras credenciais
TEST_EMAIL=outro@exemplo.com TEST_PASSWORD=Senha123 k6 run ...
```

### Ajustar carga inline

```bash
# Load com 100 VUs por 5min sem editar o arquivo
k6 run --vus 100 --duration 5m tests/k6/scenarios/load.js
```

### Rodar via Docker (sem instalar k6)

Rodar a partir da raiz do projeto. **Atenção à sintaxe do shell:**

**PowerShell:**
```powershell
docker run --rm -v "${PWD}/tests/k6:/scripts" `
  -e BASE_URL=http://host.docker.internal:5000/api `
  grafana/k6:latest run /scripts/scenarios/smoke.js
```

**Windows CMD (`cmd.exe`):**
```cmd
docker run --rm -v "%cd%\tests\k6:/scripts" ^
  -e BASE_URL=http://host.docker.internal:5000/api ^
  grafana/k6:latest run /scripts/scenarios/smoke.js
```

**Linux/macOS bash:**
```bash
docker run --rm -v "$(pwd)/tests/k6:/scripts" \
  -e BASE_URL=http://host.docker.internal:5000/api \
  grafana/k6:latest run /scripts/scenarios/smoke.js
```

Ou colocar o container do k6 na mesma network do docker-compose (evita
depender de `host.docker.internal` e é mais rápido):

```powershell
# Descobre o nome da network primeiro:
docker network ls

# Depois roda o k6 nela (assumindo network 'dutyhub_default'):
docker run --rm --network dutyhub_default `
  -v "${PWD}/tests/k6:/scripts" `
  -e BASE_URL=http://api:5000/api `
  grafana/k6:latest run /scripts/scenarios/load.js
```

## SLIs / Thresholds

Definidos em `config.js`:

| Métrica              | Load (default)     | Stress            |
| -------------------- | ------------------ | ----------------- |
| `http_req_failed`    | < 1%               | < 10%             |
| `http_req_duration`  | p95 < 500ms        | p95 < 1500ms      |
|                      | p99 < 1000ms       | p99 < 3000ms      |

Se algum threshold falhar, o k6 sai com código != 0 (útil pra CI/CD).

## Lendo o output

Ao final o k6 imprime um resumo tipo:

```
http_req_duration.............: avg=127ms  p(95)=284ms  p(99)=612ms
http_req_failed................: 0.00% 
http_reqs.....................: 3421   28.5/s
iteration_duration............: avg=1.2s
```

- **avg / p(95) / p(99)**: latência média e percentis.
- **http_req_failed**: taxa de requisições 4xx/5xx ou erro de rede.
- **http_reqs**: throughput total e RPS médio.
- **iteration_duration**: quanto uma iteração completa do fluxo levou.

Cada endpoint tem uma tag `name` (ex: `GET /shifts/me/today`), então nas
métricas por tag dá pra ver qual endpoint está degradado.

## Cenários pré-configurados

### smoke.js
Baseline. 1 VU, 30s. Só verifica que nenhum endpoint quebra sob 1 usuário.

### load.js
Cenário nominal. Sobe até 30 VUs em 30s, mantém por 2min, desce em 30s.
Representa ~30 médicos abrindo a home + histórico simultaneamente.

### stress.js
Sobe até 200 VUs em degraus (50 → 100 → 200) e segura 2min no pico.
Use pra descobrir onde a API começa a degradar antes de ir pra produção.

### checkin-cycle.js
Roda 20 iterações do ciclo completo de check-in + check-out para o médico
teste. Rode isoladamente porque a regra "um plantão ativo por usuário"
impede paralelização real com o mesmo user.

## Estendendo

Pra adicionar um novo fluxo:

1. Cria um arquivo em `flows/` que exporta uma função recebendo `session`.
2. Cria um cenário em `scenarios/` importando esse fluxo e definindo
   `options` (stages, thresholds).

Pra testar concorrência de escrita de verdade, seria preciso seedar N
médicos e distribuir as VUs entre eles no `setup()`.

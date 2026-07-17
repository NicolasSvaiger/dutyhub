# Performance tests

Load smoke tests for the DutyHub API. Non-goal: stress testing to
breaking point. Goal: catch p95 regressions on the endpoints the
professional hits every day, at load slightly above realistic peak.

## Run in CI (recommended)

Actions → **Performance / Load smoke** → **Run workflow**. Uses the
same Cognito secrets already configured for the E2E job. Prints a
summary in the run's step summary; if a threshold fails the workflow
fails.

## Run locally

Requires k6 (`brew install k6` on macOS, [download](https://k6.io/docs/get-started/installation/)
on other platforms), Docker Desktop, and AWS Cognito credentials.

```bash
# 1. Start the stack
docker compose up -d --wait --build

# 2. Point k6 at it
k6 run \
  --env BASE_URL=http://localhost:5000 \
  --env COGNITO_REGION=us-east-1 \
  --env COGNITO_CLIENT_ID=<your-app-client-id> \
  --env USER_EMAIL=medico@plantonhub.com \
  --env USER_PASSWORD=Teste@123 \
  perf/load-smoke.js
```

Local runs are useful for tuning thresholds after changing an endpoint,
but the runtime environment (dev machine vs. GitHub Actions runner)
matters — treat CI numbers as the source of truth for regression checks.

## Load profile

```
30s ramp-up  → 25 VUs
60s steady   → 25 VUs
30s ramp-down → 0
Total: ~2 min
```

25 VUs is 5-10x above realistic simultaneous professional usage per OS
today. Enough headroom to catch a query that scales poorly (N+1, missing
index) without burning CI minutes on a load nobody hits in practice.

## Thresholds

Encoded in `load-smoke.js`. Current baseline:

| Metric | Threshold |
|---|---|
| Request success rate | > 99% (`http_req_failed rate < 0.01`) |
| Hot GET p95 | < 500ms |
| Heavy GET p95 | < 2000ms |

**Hot endpoints** (called on every `/doctor` page load — tightest budget):
- `GET /api/auth/session`
- `GET /api/clinics`
- `GET /api/shifts/me/today`
- `GET /api/attendance/status`
- `GET /api/attendance/active`

**Heavy endpoints** (aggregations, joins across clinics):
- `GET /api/shifts/me`
- `GET /api/attendance/my-history`

## What's not covered

- **Writes** (`POST /attendance/check-in`, etc.) — would accumulate DB
  rows across runs. Doable with cleanup plumbing but not now.
- **Admin OS endpoints** — needs an admin token too. Reasonable next
  step if admin dashboard perf becomes a concern.
- **Stress / breaking point** — different intent than a smoke. If a
  release needs sizing data, run k6 with `--vus 500 --duration 5m` ad-hoc.

## Adjusting thresholds

Numbers were picked from the current architecture (Postgres t4g.micro,
App Runner 0.5 vCPU, Redis Upstash). Move them in `load-smoke.js` if:

- Infra grows and the baseline improves → tighten. Regressions catch
  faster.
- New feature adds justified latency (heavy join, external call) →
  loosen for that specific endpoint, don't loosen globally.

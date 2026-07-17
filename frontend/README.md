# DutyHub — Frontend

SPA React + TypeScript (Vite) do PlantonHub. Consome a API .NET 8 e
autentica direto no AWS Cognito via `amazon-cognito-identity-js`.

## Stack

| Categoria | Tecnologia |
|-----------|-----------|
| Bundler | Vite |
| UI | React 18 + TypeScript |
| Routing | React Router |
| HTTP | Axios (interceptors para Bearer + refresh) |
| Auth | AWS Cognito SDK (client-side, PKCE) |
| i18n | i18next (`pt`, `en`, `es`) |
| Testes unit | Vitest + Testing Library |
| E2E | Playwright |
| Lint | Oxlint |

## Estrutura

```
frontend/
├── src/
│   ├── api/          # Axios instance + endpoints (usersApi, shiftsApi, ...)
│   ├── contexts/     # AuthContext, ClinicContext, ThemeContext
│   ├── hooks/        # useAuth, useClinic, useGeolocation, useOfflineSync
│   ├── pages/
│   │   ├── admin/    # 17 telas do Admin OS (sidebar navigation state-based)
│   │   ├── doctor/   # Área do profissional (bottom-nav)
│   │   └── LoginPage / ForgotPasswordPage
│   ├── components/   # ProtectedRoute, ClinicSelector, OfflineBanner, ...
│   ├── config/       # brand, roles, cognito
│   ├── i18n/         # locales pt/en/es
│   └── types/        # DTOs espelhando os do backend
├── public/           # HTMLs de referência dos mocks + retryQueue.js
├── e2e/              # Playwright specs (auth, doctor-flow, admin-flows)
└── vite.config.ts
```

## Executar

### Com o backend em Docker Compose (recomendado)

Na raiz do repo:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:5000

### Modo dev (Vite HMR)

Com a API já rodando (via Docker ou `dotnet run`):

```bash
cd frontend
npm install
npm run dev
```

O Vite sobe em http://localhost:5173. Configure `frontend/.env.development`
com as credenciais Cognito:

```
VITE_API_URL=http://localhost:5000/api
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_REGION=us-east-1
```

## Testes

### Unit + component (Vitest)

```bash
npx vitest --run           # single run
npx vitest                 # watch mode
npx vitest --run --coverage
```

Baseline atual: **522 testes** em **34 arquivos**. Executam também no CI
(`frontend-unit-tests`).

### E2E (Playwright)

Requer stack completo rodando (Docker Compose + Cognito real):

```bash
docker compose up -d --wait --build
cd frontend
npm run build:e2e-env      # opcional se .env.development já está OK
npx playwright test
```

Test files:

- `e2e/auth.spec.ts` — login Cognito, senha inválida, logout, esqueci
  senha.
- `e2e/doctor-flow.spec.ts` — home do profissional, modal check-in,
  navegação bottom-nav.
- `e2e/admin-flows.spec.ts` — smoke das 5 telas admin críticas
  (Dashboard, Médicos, Escalas, UPAs, Tempo Real) + route guard.

Também executa no CI (`frontend-e2e-tests`). Localmente exige AWS
credentials para chegar no Cognito.

## Roteamento e proteção

Rotas registradas em `App.tsx`, todas envolvidas em `<ProtectedRoute>`
exceto login e forgot-password:

| Rota | Requer role | Descrição |
|------|-------------|-----------|
| `/login` | — | Login profissional (Cognito SDK) |
| `/admin/login` | — | Login admin (mesmo Cognito, layout separado) |
| `/forgot-password` | — | Reset de senha (Cognito) |
| `/dashboard` | qualquer autenticado | Dashboard genérico |
| `/shifts` | qualquer autenticado | Lista de plantões |
| `/attendance` | Profissional | Check-in/out |
| `/clinics` | AdminGlobal/AdminClinica | CRUD clínicas |
| `/users` | AdminGlobal | CRUD usuários |
| `/doctor` | Profissional | Área do médico (bottom-nav) |
| `/admin` | AdminGlobal/AdminClinica | Admin OS (sidebar state-based) |

`ProtectedRoute` redireciona para `/login` se sem token, e para
`/dashboard` se autenticado sem a role exigida. `AdminLoginPage`
redireciona autenticados admin direto para `/admin`.

## Offline-first (check-in / check-out)

O médico consegue registrar check-in mesmo offline. O evento é
enfileirado no localStorage e o `useOfflineSync` faz o `POST
/api/attendance/sync` quando volta a internet. Detalhes completos na
seção "Offline First" do README raiz.

## i18n

Três idiomas embutidos: pt (default), en, es. O `LanguageSwitcher` no
header do doctor troca em runtime. Adicionar chaves em
`src/i18n/locales/*.json`.

## Convenções

- CSS Modules por página (`AdminPage.module.css`, `DoctorPage.module.css`)
  isolando estilos do mock original.
- SVGs inline nas páginas admin (do mock) — não usar biblioteca de icons.
- API calls sempre via `src/api/<entidade>Api.ts` (nunca `axios` direto
  na página). Tipos em `src/types/index.ts` espelham DTOs do backend.
- Componentes admin recebem callbacks `onOpenSidebar` para
  compatibilidade com o layout mobile.

## Oxlint

Regras em `.oxlintrc.json`. Rodar:

```bash
npx oxlint
```

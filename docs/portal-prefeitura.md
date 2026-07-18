# Portal Prefeitura

Portal separado do PlantonHub voltado a **gestores de órgãos públicos**
que contrataram uma Organização de Saúde (OS) para operar Unidades de
Pronto Atendimento (UPAs). O gestor tem acesso somente-leitura aos
indicadores operacionais das UPAs vinculadas ao seu contrato, com uma
única mutação disponível — **Acionar OS** — para sinalizar ausências
críticas que exigem intervenção da equipe operacional.

Entregue em duas sprints: **7A/7B/7C.1** (foundation + endpoints +
telas iniciais) e **7C.2/7C.3** (sub-views operacionais + Modo TV).

## Modelo de auth

### Nova role

`RoleType.GestorPublico = 6` foi adicionado à enum de roles do domínio.
Diferente das roles de clínica (AdminGlobal, AdminClinica, Medico,
Enfermeiro), o gestor não tem escopo por clínica — ele opera sobre um
**PublicOrgan**.

### Entidade `UserPublicOrganRole`

Vincula um `User` a um `PublicOrgan` com uma role específica.
Unique constraint composto `(UserId, PublicOrganId)`, cascade delete em
User e PublicOrgan.

```csharp
public class UserPublicOrganRole
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid PublicOrganId { get; set; }
    public RoleType Role { get; set; }   // GestorPublico
    public DateTime AssignedAt { get; set; }

    public User User { get; set; } = null!;
    public PublicOrgan PublicOrgan { get; set; } = null!;
}
```

### Claim JWT

A Lambda pre-token-generation lê a tabela `UserPublicOrganRole` no
login do usuário e injeta o claim `publicOrganId` (string GUID) no ID
Token. O backend usa esse claim para filtrar dados por escopo.

Se a Lambda não puder ser atualizada (bloqueio operacional), o
`TenantMiddleware` faz fallback lendo direto do DB — com in-process
cache reaproveitando o mesmo `_identityCache` já usado para `clinicIds`.
Latência adicional ~5-20 ms no cold path.

### Policy

Policy `"GestorPublico"` em `AuthorizationExtensions.cs` valida que o
usuário tem essa role. Todos os endpoints do controller Prefeitura são
`[Authorize(Policy = "GestorPublico")]`.

### Hierarquia parent/child

`PublicOrgan.ParentId` permite representar subprefeituras dentro de
uma prefeitura maior. `IPublicOrganRepository.GetDescendantIdsAsync`
faz uma query recursiva (CTE ou walk in-memory conforme performance)
que retorna todos os descendentes de um organ raiz.

Um gestor vinculado à prefeitura raiz vê os dados de todas as
subprefeituras. Um gestor vinculado a uma subprefeitura vê apenas os
dados dessa subprefeitura e de suas eventuais filhas.

**Débito conhecido:** um mesmo user hoje só pode ter uma role em um
único organ. Multi-organ para o mesmo gestor está documentado no
`design.md` da sprint 7 como fora de escopo.

## Rotas

| Rota | Acesso | Comportamento |
|------|--------|---------------|
| `/prefeitura/login` | Público | Layout hero+form, redirect por role no useEffect |
| `/prefeitura` | GestorPublico | Portal com sidebar + 8 sub-views (activeView state) |
| `/prefeitura/tv` | GestorPublico | Modo TV fullscreen (dark theme, polling 20s) |

`ProtectedRoute` gera 403 → redirect para `/prefeitura/login` se não
autenticado, ou para `/dashboard` se autenticado sem a role.

O `AppLayout` esconde o header top em `/prefeitura*` — o portal tem
sua própria sidebar. Mesmo padrão do `/admin*`.

O redirect por role no `useEffect` da `PrefeituraLoginPage`:

- `GestorPublico` → `/prefeitura` (ou `/prefeitura/tv` se `?tv=1` na URL)
- `AdminGlobal` / `AdminClinica` → `/admin`
- Qualquer outra → `/doctor`
- Sem roles → `/login`

## 10 telas / sub-views

Todas as sub-views vivem em `frontend/src/pages/prefeitura/`. A troca é
state-based (não muda a URL) — a URL fica em `/prefeitura` e o
`activeView` no `PrefeituraPage` decide qual componente renderizar.
Modo TV é a exceção — rota separada em fullscreen, sem sidebar.

### 1. Início (`PrefeituraWelcome`)

Chama `GET /api/prefeitura/dashboard` no mount. Renderiza:

- Hero card com gradiente teal → orange + nome do gestor + email
- 4 KPI cards: cumprimento do dia, coberto/previsto, atrasos, ausências
- Section de alertas recentes com AlertDot colorido por level
  (critical/warning/info)

Estados: loading (placeholders "—"), error (mensagem específica para
`NO_ORGAN_CONTEXT` vs erro genérico), empty (sem alertas abertos).

### 2. Indicadores KPIs (`PrefeituraKpis`)

Filtro `from/to` (default últimos 30 dias) + botão Aplicar. Chama
`GET /api/prefeitura/kpis?from&to`.

- Card hero grande com % de cumprimento global + período formatado pt-BR
- Grid 3 colunas com 6 KPIs (previstos, cobertos, ausências,
  atrasos, média de atraso em min, taxa de substituição)
- Tabela por UPA com colorização por faixa (`rateClass`):
  - ≥ 90% → verde
  - 70-89% → laranja
  - < 70% → vermelho

### 3. Escalas (`PrefeituraEscalas`)

Filtros `from/to/clinicId opcional`. Chama `GET /api/prefeitura/shifts`
+ `GET /api/prefeitura/clinics` (para popular o dropdown).

Grid de cards (auto-fill 320px+) — 1 card por plantão com:

- Clínica, título, data, horário start → end
- Progress bar `checkedInCount / totalAssignees`
- Lista de assignments com nome e status (Presente / Pendente)

### 4. Frequência (`PrefeituraFrequencia`)

Filtros `from/to/clinicId`. Chama `GET /api/prefeitura/frequency`.

Tabela `date / clinic / expected / actual / presenceRate`. `presenceRate`
usa a mesma classe de faixa dos KPIs. Botões Exportar PDF/XLSX no
filter action bar → dispara `downloadReport('frequency', format)`.

### 5. Atrasos (`PrefeituraAtrasos`)

Filtros `from/to`. Chama `GET /api/prefeitura/absences?type=late`.

Tabela `user / clinic / date / shift / minutesLate / justified`.
Badges colorizados:

- `minutesLate >= 30` → bad (vermelho)
- `minutesLate < 30` → warn (laranja)
- `justified === true` → good (verde)
- `justified === false` → muted (cinza)

Export via `downloadReport('atrasos', format)`.

### 6. Ausências (`PrefeituraAusencias`)

Filtros `from/to`. Chama `GET /api/prefeitura/absences?type=absence`.

Tabela `user / clinic / date / shift / substitute / action`. A coluna
substitute mostra "Sem substituto" (badge muted) ou o nome do
substituto (badge good). A coluna action tem o botão **Acionar OS**
que abre um modal:

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- Backdrop click fecha, `stopPropagation` no body evita fechar por
  engano
- Textarea opcional para descrição
- Ao confirmar → `POST /api/prefeitura/absences/{id}/notify-os`
  (rate limit 5/min via policy `PrefeituraNotifyOs`)
- Após sucesso: toast de 5s "OS acionada com sucesso" + botão vira
  "Notificado" desabilitado (Set local `notifiedIds`)
- Após erro: `modalError` inline, modal permanece aberto para retry
- Durante a request: `closeModal` bloqueado

Export via `downloadReport('ausencias', format)`.

### 7. Histórico (`PrefeituraHistorico`)

Filtros `from/to/type/search`. Chama
`GET /api/prefeitura/history?page&pageSize&from&to&type&search`.
`pageSize = 30` fixo.

- Filtro `type` = dropdown com 5 opções (checkin, absence,
  substitution, alert, justification)
- Filtro `search` = wide input livre
- Tabela `timestamp / type (badge) / event (title + details) /
  user / clinic`
- Paginação Anterior/Próxima + "Página X de Y" + totalCount ("N
  eventos")
- Reset automático para `page=1` ao mudar qualquer filtro

Export via `downloadReport('history', format)`.

### 8. Tempo Real (`PrefeituraRealtime`)

Chama `GET /api/prefeitura/realtime` no mount + `setInterval` de 30s
com cleanup no unmount. `cancelled` flag no `fetchOnce` evita
`setState` após unmount se a request estiver em flight.

- Header com pulseDot + timestamp `asOf` formatado
- Grid 4 cols com totalizadores (`totalClinics`, `expectedNow`,
  `presentNow`, `absentNow`)
- Grid auto-fill 280px+ com cards de UPA — border-left colorizado por
  `alertLevel`:
  - `green` → teal
  - `yellow` → orange
  - `red` → vermelho
- Lista de nomes ausentes por UPA em badges vermelhos

### 9. Modo TV (`PrefeituraTvMode`) — `/prefeitura/tv`

Rota separada em fullscreen, otimizada para display em telão. Dark
theme fixo (evita cansaço visual), fontes gigantes (fonte 5rem para
totalizadores), cores fortes por `alertLevel`.

- `setInterval` de 20s para `getRealtime` (mais agressivo que a view
  Realtime porque o telão precisa estar sempre fresco)
- `setInterval` separado de 1s para o relógio wall-clock
- Botão exit aparece só no `:hover` (não polui o display), chama
  `navigate('/prefeitura', { replace: true })`

O gestor abre o Modo TV via botão **Modo TV** na seção "Monitoramento"
da sidebar — o botão faz `window.open('/prefeitura/tv', '_blank',
'noopener,noreferrer')`, preservando o contexto do portal principal.

### 10. Login (`PrefeituraLoginPage`)

Layout 2 colunas (hero teal→orange + form centralizado) baseado no
mock `originais/Prefeitura/op-login.html`. Ids únicos escopados
(`#prefeitura-email`, `#prefeitura-password`) evitam colisão com outras
telas de login do app.

Reusa `useAuth().login()` (Cognito SDK) — MFA/refresh tratados no
`AuthContext`, não recria fluxo. Tratamento de erro Cognito
(NotAuthorizedException/UserNotFoundException/LimitExceededException)
mapeado para i18n keys `prefeitura.login.errorInvalidCredentials`,
`errorTooManyAttempts`, `errorGeneric`.

`ThemeToggle` no canto superior direito reusa `useTheme()` do doctor
page.

## Fluxo administrativo: criar um gestor

Fluxo esperado (não automatizado no portal atual — deve rodar via
admin ou seed):

1. **AdminGlobal cadastra o `PublicOrgan`** no banco (via CDK seed ou
   endpoint admin futuro). Preencher `Cnpj`, `Department`, `City`,
   `State`, `ContactName/Email/Phone`. Se for subprefeitura, setar
   `ParentId` para o organ raiz.

2. **AdminGlobal cria o usuário no Cognito** (via console AWS ou CLI):
   ```bash
   aws cognito-idp admin-create-user \
     --user-pool-id <pool-id> \
     --username gestor.prefeitura@exemplo.gov.br \
     --user-attributes Name=email,Value=gestor.prefeitura@exemplo.gov.br \
     --temporary-password 'TempSenha@123'
   ```

3. **Adiciona o user ao grupo `GestorPublico`** no Cognito:
   ```bash
   aws cognito-idp admin-add-user-to-group \
     --user-pool-id <pool-id> \
     --username gestor.prefeitura@exemplo.gov.br \
     --group-name GestorPublico
   ```

4. **Insere linha em `Users`** do Postgres, referenciando o `Sub` do
   Cognito como `UserId` (padrão do resto do sistema).

5. **Insere linha em `UserPublicOrganRole`** vinculando o user ao
   organ com `Role = GestorPublico`.

6. **Primeiro login**: o gestor é obrigado a trocar a senha temporária
   (fluxo NEW_PASSWORD_REQUIRED do Cognito, tratado pelo AuthContext).

7. **Verifica**: gestor acessa `/prefeitura/login`, entra, é
   redirecionado para `/prefeitura` (view Início). Se a Lambda
   pre-token estiver ativa, o claim `publicOrganId` está no JWT; caso
   contrário, o middleware faz fallback DB no primeiro request.

Automatização futura via endpoint admin (ex:
`POST /api/admin/gestores`) está no backlog mas fora do escopo da
Sprint 7.

## Modo TV — setup em display

Cenário típico: TV/monitor de 55" pendurada na sede da OS mostrando
o status ao vivo das UPAs contratadas. Setup:

1. **Máquina simples** (Raspberry Pi, mini-PC, ou Chromebox) com
   Chrome/Edge ligada à TV via HDMI.
2. Configurar auto-boot em modo kiosk apontando para
   `https://prefeitura.exemplo.com.br/prefeitura/login?tv=1`.
3. Login com credenciais do gestor — o `?tv=1` faz o redirect ir para
   `/prefeitura/tv` em vez de `/prefeitura`.
4. Habilitar "auto reconectar" / "manter tela ligada" no OS.
5. O polling de 20s garante que os dados fiquem sempre frescos. O
   relógio wall-clock reforça que o display está vivo.

Se o token Cognito expirar (janela padrão 1h), o interceptor axios
tenta refresh automaticamente. Se o refresh falhar, o próximo fetch
retorna 401 e o `ProtectedRoute` redireciona para `/prefeitura/login`
— o kiosk detecta e a próxima interação pede login novo. Idealmente
programar reboot noturno para forçar re-login sem sessão longa.

## Rate limits

Duas policies dedicadas do portal Prefeitura, além do `Session`
compartilhado com o resto da API:

| Policy | Limite | Aplicado em |
|--------|--------|-------------|
| `Session` | Padrão da API (herdado) | 8 endpoints GET de leitura |
| `PrefeituraNotifyOs` | 5 req/min por user | `POST /absences/{id}/notify-os` |
| `PrefeituraExport` | 10 req/min por user | `GET /reports/{type}/export` |

O rate limit de export é apertado porque cada request gera um PDF/XLSX
no servidor — 10/min impede o gestor de acidentalmente derrubar a
memória do App Runner clicando várias vezes.

## Cache Redis

Chaves cacheadas em `CacheKeys`:

- `PrefeituraDashboard(organId)`
- `PrefeituraKpis(organId, from, to)`
- `PrefeituraClinics(organId)`
- `PrefeituraFrequency(organId, from, to, clinicId?)`
- `PrefeituraAbsences(organId, from, to, type?)`
- `PrefeituraRealtime(organId)` — TTL curto (30s)
- `OrganScope(organId)` — lista de descendentes + clinicIds ativos

TTLs configurados em `PrefeituraService`. O cache é key-por-organ, o
que garante isolamento total entre gestores de organs diferentes
mesmo se compartilharem a mesma instância Redis.

## Export PDF/XLSX

Backend usa **QuestPDF** (MIT) para PDF e **ClosedXML** (MIT) para
Excel. Estrutura em `src/PlantonHub.Application/Reports/`:

- `Pdf/SharedComponents.cs` — header/footer padrão com logo 24p7 +
  filtros aplicados
- `Pdf/KpisPdfDocument.cs`, `FrequencyPdfDocument.cs`,
  `AtrasosPdfDocument.cs`, `AusenciasPdfDocument.cs`,
  `HistoryPdfDocument.cs`
- `Excel/FrequencyExcelWorkbook.cs`, `AtrasosExcelWorkbook.cs`,
  `AusenciasExcelWorkbook.cs`, `HistoryExcelWorkbook.cs`

`IReportService.GenerateAsync(ReportRequest)` orquestra tipo/formato.
O endpoint `GET /api/prefeitura/reports/{reportType}/export?format=...`
retorna `File(bytes, contentType, filename)` com
`Content-Disposition: attachment`.

Frontend faz a request com `responseType: 'blob'`, parseia o
`Content-Disposition` para pegar o filename, cria `<a download>` com
`URL.createObjectURL`, dispara click, revoga o objeto URL. Enquanto
baixa, o botão fica disabled e mostra "Carregando...".

## Testes

- **Backend unit** (`PlantonHub.UnitTests`): 30 testes em
  `PrefeituraServiceTests.cs` cobrindo os 10 métodos + permissão +
  agregações + hierarquia.
- **Backend property** (`PlantonHub.PropertyTests`): 5 propriedades em
  `PrefeituraPropertyTests.cs` (isolamento por organ, hierarquia
  recursiva, idempotência, PDF/Excel não-vazios).
- **Backend integration** (`PlantonHub.IntegrationTests`):
  `PrefeituraFlowIntegrationTests.cs` com Testcontainers + Cognito
  real (10 cenários — pulados quando AWS creds ausentes com
  `Xunit.SkippableFact`).
- **Frontend vitest**: 139 testes em
  `frontend/src/pages/prefeitura/__tests__/` cobrindo todas as 8
  sub-views + PrefeituraLoginPage + PrefeituraPage + PrefeituraTvMode.
- **E2E Playwright**: `prefeitura-flows.spec.ts` (~9 smokes) +
  `prefeitura-tv.spec.ts` (3 testes com detecção de polling via
  `page.on('response')`).
- **k6 performance**: `prefeitura-smoke.js` — sanidade 1 VU × 30s com
  DEFAULT_THRESHOLDS (p95 < 500ms, error rate < 1%).

## Referências

- Spec original: `.kiro/specs/sprint-7-prefeitura/requirements.md` /
  `design.md` / `tasks.md`
- Commits principais:
  - `88b141c` — Sprint 7C.1 (foundation frontend)
  - `3a300f4` — Sprint 7C.2+7C.3 (6 sub-views + Modo TV)

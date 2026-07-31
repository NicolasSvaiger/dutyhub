# Backlog técnico — DutyHub

Mapa dos itens levantados e **ainda não implementados** (segurança, observabilidade,
multi-OS e follow-ups). Serve de ponto de partida para retomar cada tema sem
precisar reconstruir o contexto.

_Atualizado em: 30/07/2026._

Legenda de prioridade: 🔴 alta · 🟡 média · 🟢 baixa/oportunista.
Esforço: P (pequeno, < 1 dia) · M (médio) · G (grande, precisa design antes).

---

## 1. Segurança

### 1.1. 🔴 Rate limit nos exports do Admin/OS — P
**Dívida introduzida na feature de export de relatórios.**
Os endpoints de export geram PDF/Excel (QuestPDF/ClosedXML), operação
CPU-bound, e hoje estão **sem rate limit** — dá para abusar e saturar CPU.
São **quatro** endpoints:
- `GET /api/management-report/export` (`ManagementReportController.Export`)
- `GET /api/management-report/export/presentation` (`ManagementReportController.ExportPresentation`)
- `GET /api/billing/report/export` (`BillingController.ExportReport`)
- `GET /api/audit/logs/export` (`AuditController.ExportLogs`)

- Como: criar policy no `Program.cs` (já existe o padrão `PrefeituraExport`,
  10/min por usuário) — ex.: `AdminExport` — e anotar os quatro endpoints com
  `[EnableRateLimiting("AdminExport")]`.
- Verificação: hook de commit exige unit + property + vitest verdes.

### 1.2. 🟡 Biometria em repouso (LGPD) — M
Embeddings faciais são persistidos; a validação vai migrar para provedor externo
(Techmag, modelo de hash).

- Confirmar criptografia em repouso (RDS encryption) e política de retenção.
- Já existe delete por LGPD (`DELETE /api/biometric/enroll/me`).
- Formalizar o fluxo de dados / DPA com a Techmag na migração.
- Garantir que embeddings e tokens nunca entrem em log (Serilog).

### 1.3. 🟡 Anti-abuso no auto-cadastro anônimo — M
`POST /api/auth/register` é anônimo e cria profissionais em estado `Pendente`.
Hoje protegido só por rate limit (3/min por IP).

- Risco: enxurrada de cadastros falsos que a OS teria que triar.
- Opções: verificação de e-mail antes de virar `Pendente`, captcha, ou
  heurística de reputação por IP.
- Onde: `AuthController.Register` + `RegistrationService.SelfRegisterAsync`.

### 1.4. 🟢 Cache no `/clinics/public` — P
Endpoint anônimo que lista todas as UPAs ativas com coordenadas (campos mínimos,
rate limit 20/min por IP). É por design, mas é superfície anônima.

- Adicionar `ETag`/`Cache-Control` (o padrão já existe via `ETagActionFilter`).
- Monitorar volume; se algum dia for sensível, reduzir precisão das coordenadas.
- Onde: `ClinicsController.GetPublic`.

### 1.5. 🟢 Secret scanning no CI — P
Dependabot já cobre dependências, mas não segredos commitados.

- Adicionar um scan (ex.: gitleaks) no workflow `.github/workflows/ci.yml`.

---

## 2. Observabilidade

Estado atual: logging estruturado (Serilog → JSON no stdout, capturado pelo
CloudWatch), request logging (método/rota/status/latência), health checks
(`/health`, `/health/ready` com Postgres + Redis) e auditoria de domínio.
**Não há** tracing distribuído, métricas nem correlation id
(confirmado: `PlantonHub.API.csproj` só tem Serilog + health checks).

### 2.1. 🔴 Metric filters + alarmes no CloudWatch — P
Primeiro passo barato, aproveitando que o log já é JSON.

- Metric filters: taxa de 5xx, contagem de 429, latência (campo `Elapsed` do
  request logging).
- Alarmes: `/health/ready` falhando, spike de 5xx, spike de 429, CPU/mem do
  App Runner.

### 2.2. 🟡 OpenTelemetry (traces + metrics) — M
- Pacotes OTel para ASP.NET Core + EF Core + StackExchange.Redis (instrumentações
  prontas).
- Export OTLP → X-Ray/CloudWatch (ou Grafana Tempo/Prometheus).
- Ganha p95 de latência por rota, throughput e taxa de erro sem garimpar log.

### 2.3. 🟡 Correlation ID — P
- Middleware que gera/propaga `X-Request-Id` + enricher no Serilog.
- App mobile/web passa o id para amarrar logs de ponta a ponta.

### 2.4. 🟢 Métricas de feature/negócio — M
- Duração e tamanho da geração dos PDFs/Excel (exports novos).
- Taxa de sucesso de check-in; % de eventos offline que caem em `RequiresReview`.
- Distribuição de `confidence` da biometria.

---

## 3. Configurações por OS / multi-OS (análise pendente — não implementar antes)

Contexto levantado nesta sessão: hoje as configurações são um **`SystemSettings`
singleton global** (single-OS, sem entidade de OS/tenant). O usuário sinalizou que
"tem a parte de nomes que passam por OS" e outras coisas que podem surgir.

**Antes de codar, fazer uma análise** (entregável = doc de proposta):
- Mapear o modelo de tenant/OS atual (há `ITenantService`, papéis
  AdminGlobal/AdminClinica, `PublicOrgan`/`Contract`) e decidir a unidade de
  isolamento (por OS? por contrato?).
- Separar o que é **global** do que é **por-OS** dentro das settings.
- Rastrear onde os "nomes que passam por OS" são usados (branding, remetente de
  e-mail, cabeçalho de relatório, etc.) — inclusive nos geradores de PDF/Excel
  (`Reports/Pdf/SharedComponents.cs` usa "24p7" fixo no header).
- Impacto em migrations, escopo de autorização e cache.
- Onde olhar: `SettingsService`/`ISettingsService`, `SettingsController`,
  `SystemSettings` (Domain), `TenantService`.

---

## 4. Follow-ups menores desta sessão

### 4.1. ✅ Botão "Apresentação" no Gerencial — FEITO
Implementado como export PDF em modo apresentação (paisagem, estilo slides):
`ReportType.ManagementPresentation` + `ManagementPresentationPdfGenerator`,
endpoint `GET /api/management-report/export/presentation` e
`managementReportApi.downloadPresentation`. (Falta só o rate limit do item 1.1.)

### 4.2. 🟢 Filtros/paginação no histórico de presença — M
Documentado em `docs/flutter-api-contract.md` (§5.5): `GET /api/attendance/my-history`
ainda **não** tem `?from`, `?to`, `?clinicId` nem paginação. Implementar se/quando
o app precisar.

### 4.3. ✅ Export de logs na Auditoria (PDF + Excel) — FEITO
Implementado: `ReportType.AuditLog` + `AuditLogPdfGenerator` (paisagem) +
`AuditLogExcelGenerator`; endpoint `GET /api/audit/logs/export?format=pdf|xlsx`
[AdminGlobal] que reaproveita os filtros do GET (`from/to/userId/module/operation/
search`), junta as páginas (200/pág) até um teto de 5.000 linhas e chama
`IReportService.GenerateFromPayloadAsync`; frontend `auditApi.downloadReport` com
os dois botões ligados aos filtros ativos.

Pendências relacionadas (não bloqueiam):
- Rate limit (item **1.1**) neste endpoint (CPU-bound).
- Bônus ainda não feito: auditar a própria exportação usando
  `AuditOperation = 'Export'` (registrar quem exportou o quê).
- Se o volume crescer, avaliar exigir range de datas obrigatório em vez do
  teto fixo de 5.000 linhas.

---

## Referências

- Contrato mobile: [`flutter-api-contract.md`](flutter-api-contract.md)
- Biometria: [`flutter-biometric-api.md`](flutter-biometric-api.md)
- Portal prefeitura: [`portal-prefeitura.md`](portal-prefeitura.md)

# Sprint 6 — Dashboard Admin OS

**Deadline:** 30/07/2026
**Esforço:** 10-12 dias
**Dependência:** Sprint 2 (Cognito pra gestão de users)

---

## Objetivo

Implementar a área administrativa da OS (Organizadora Social) — gestão de profissionais, escalas, clínicas/UPAs, KPIs e faturamento. Equivalente ao que fizemos pro profissional, mas pro admin.

**Referência visual:** Mocks em `frontend/public/originais/OS/admin-*.html`

---

## Telas (ordem de prioridade)

### Fase A — Core Operacional (dias 1-5)

| # | Tela | Mock | Descrição |
|---|------|------|-----------|
| 1 | Welcome/Dashboard | `admin-welcome.html` | KPIs, resumo do dia, alertas |
| 2 | Profissionais | `admin-medicos.html` | CRUD profissionais + vínculo clínica |
| 3 | Escalas | `admin-escalas.html` | Criar/editar plantões, atribuir profissionais |
| 4 | UPAs/Clínicas | `admin-upas.html` | Gestão de unidades de saúde |
| 5 | Tempo Real | `admin-tempo-real.html` | Monitor de quem está em plantão agora |

### Fase B — Gestão & Relatórios (dias 6-9)

| # | Tela | Mock | Descrição |
|---|------|------|-----------|
| 6 | Faturamento | `admin-faturamento.html` | Horas × valor por contrato |
| 7 | Gerencial | `admin-gerencial.html` | Gráficos de evolução, ocupação |
| 8 | Disponibilidade | `admin-disponibilidade.html` | Agenda dos profissionais |
| 9 | Substituições | `admin-substituicoes.html` | Trocas de plantão |
| 10 | Justificativas | `admin-justificativas.html` | Faltas e motivos |

### Fase C — Configuração & Audit (dias 10-12)

| # | Tela | Mock | Descrição |
|---|------|------|-----------|
| 11 | Auditoria | `admin-auditoria.html` | Log de todas as operações |
| 12 | Alertas | `admin-alertas.html` | Notificações e avisos do sistema |
| 13 | Configurações | `admin-configuracoes.html` | Settings do sistema |
| 14 | Gestores | `admin-gestores.html` | CRUD admins de clínica |
| 15 | Órgãos | `admin-orgaos.html` | Vinculação com prefeituras |
| 16 | Usuários | `admin-usuarios.html` | Gestão geral de todos os users |
| 17 | Login Admin | `admin-login.html` | Usa mesmo Cognito (grupo AdminGlobal/AdminClinica) |

---

## Requisitos Backend

### Endpoints novos necessários

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/admin/dashboard` | KPIs agregados (profissionais ativos, check-ins hoje, faltas) |
| `GET /api/admin/professionals` | Lista profissionais com filtros (clínica, role, status) |
| `POST /api/admin/professionals` | Criar profissional (cria no Cognito + RDS) |
| `PUT /api/admin/professionals/{id}` | Editar dados + vínculo clínica |
| `DELETE /api/admin/professionals/{id}` | Desativar (soft delete) |
| `GET /api/admin/shifts` | Listar plantões com filtros (data, clínica, profissional) |
| `POST /api/admin/shifts` | Criar plantão + atribuições |
| `PUT /api/admin/shifts/{id}` | Editar plantão |
| `DELETE /api/admin/shifts/{id}` | Cancelar plantão |
| `POST /api/admin/shifts/{id}/assign` | Atribuir profissional a plantão |
| `DELETE /api/admin/shifts/{id}/assign/{userId}` | Remover atribuição |
| `GET /api/admin/realtime` | Quem está em plantão agora (ativos cross-clinic) |
| `GET /api/admin/billing` | Horas por profissional × valor/hora |
| `GET /api/admin/reports/attendance` | Relatório de presença consolidado |
| `GET /api/admin/reports/absences` | Relatório de faltas |
| `GET /api/admin/audit-logs` | Logs de auditoria com filtros |
| `GET /api/admin/substitutions` | Trocas de plantão pendentes/aprovadas |
| `POST /api/admin/substitutions` | Solicitar troca |
| `PUT /api/admin/substitutions/{id}` | Aprovar/rejeitar troca |

### Autorização

- Todos os endpoints `/api/admin/*` requerem policy `AdminOS`
- Policy `AdminOS`: role `AdminGlobal` OU `AdminClinica`
- `AdminClinica` vê apenas dados da sua(s) clínica(s)
- `AdminGlobal` vê tudo

---

## Requisitos Frontend

### Estrutura

```
frontend/src/pages/admin/
├── AdminPage.tsx              (layout + sidebar nav)
├── AdminDashboard.tsx         (welcome + KPIs)
├── AdminProfessionals.tsx     (CRUD table)
├── AdminShifts.tsx            (calendario + gestão)
├── AdminClinics.tsx           (CRUD UPAs)
├── AdminRealtime.tsx          (monitor ao vivo)
├── AdminBilling.tsx           (faturamento)
├── AdminReports.tsx           (relatórios consolidados)
├── AdminAudit.tsx             (logs)
├── AdminSettings.tsx          (configurações)
└── __tests__/                 (component tests)
```

### Design

- Layout desktop-first (admin usa computador)
- Sidebar navigation (não bottom-nav como o profissional)
- Tabelas com paginação, filtros, busca
- Gráficos com Canvas (como nos mocks) ou Recharts
- Dark/light mode (reusar ThemeContext)
- Responsivo (tablet ok, mobile como fallback)

---

## Testes

- [ ] Unit tests dos novos services (AdminService, BillingService)
- [ ] Integration tests dos endpoints `/api/admin/*`
- [ ] Component tests das telas principais (Dashboard, Professionals, Shifts)
- [ ] E2E: login como admin → criar profissional → criar plantão → ver no realtime

---

## Prompt pra próxima sessão

> "Sprint 6 — Admin OS. Spec em .kiro/specs/sprint-6-admin-os/requirements.md. Começa pela Fase A (Dashboard + Profissionais + Escalas + UPAs + Tempo Real). Mocks em frontend/public/originais/OS/. Cognito já está configurado."

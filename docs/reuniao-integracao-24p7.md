# Reuniao: Integracao App 24p7 com Backend PlantonHub

**Data:** Julho 2026  
**Objetivo:** Alinhar o que ja existe no backend, o que precisa ser criado, e decisoes arquiteturais para a integracao do app mobile Flutter (24p7) com a API PlantonHub.

---

## 1. Status Atual

### Backend PlantonHub (pronto e deployado)
- API .NET 8 rodando em AWS App Runner (`api.laulab.com.br`)
- PostgreSQL + Redis (cache layer completo)
- 38 integration tests passando no CI
- Autenticacao JWT com refresh token e blacklist
- Controle de presenca (check-in/check-out) com geolocalizacao
- Sistema multi-clinica com roles (AdminGlobal, AdminClinica, Medico, Enfermeiro, Tecnico)

### App Flutter 24p7 (prototipo)
- Todas as telas mockadas com dados estaticos
- Nenhuma chamada HTTP implementada
- Fluxo: Splash → Biometria → Home → Check-in/out → Relatorios
- 12 rotas documentadas no contrato de API

---

## 2. Mapeamento: O que ja temos vs O que falta

### Pronto para usar (4 rotas)

| Rota 24p7 | Endpoint PlantonHub | Observacao |
|---|---|---|
| `POST /auth/logout` | `POST /api/auth/logout` | Funciona direto (blacklist JWT) |
| `POST /auth/refresh` | `POST /api/auth/refresh-token` | Apenas ajustar path no client |
| `GET /attendance/status` | `GET /api/attendance/status` | Retorna `canCheckIn`, `canCheckOut` |
| `POST /attendance/check-in` | `POST /api/attendance/check-in` | Funciona com ajustes de campos |
| `POST /attendance/check-out` | `POST /api/attendance/check-out` | Funciona com ajustes de campos |

### Precisa adaptacao (3 rotas)

| Rota 24p7 | O que existe | O que adaptar |
|---|---|---|
| `GET /me` | `GET /api/users/{id}` | Criar endpoint que usa token (sem ID na URL) |
| `GET /units` | `GET /api/clinics` | Mapear campos: `Id`→`key`, `Name`→`name` |
| `GET /attendance/records` | `GET /api/attendance/my-history` | Adicionar filtros `from`, `to`, `upaKey` e paginacao |

### Precisa criar do zero (4 rotas)

| Rota 24p7 | Complexidade | Descricao |
|---|---|---|
| `POST /auth/biometric` | **Alta** | Autenticacao por biometria facial |
| `GET /auth/session` | Baixa | Validar se token atual e valido (retorna user ou 401) |
| `GET /units/nearest` | Media | Calcular clinica mais proxima por lat/lng |
| `GET /attendance/summary` | Media | Agregar dias trabalhados, horas totais, ausencias |

---

## 3. Decisao Arquitetural Critica

### Check-in: por UPA ou por Plantao?

O app 24p7 foi desenhado para check-in por **UPA (unidade)**:
```
Medico chega → Seleciona UPA → Confirma check-in
```

O backend PlantonHub opera por **Plantao (shift)**:
```
Medico chega → Precisa ter plantao atribuido → Check-in vinculado ao shift
```

#### Opcao A: Plantao Livre (Walk-in)
- Backend cria plantao automatico diario para cada clinica
- Medico faz check-in sem precisar de agendamento previo
- **Vantagem:** Simples pro medico, app funciona como projetado
- **Desvantagem:** Perde rastreabilidade de quem deveria estar onde

#### Opcao B: Plantao Obrigatorio
- Admin agenda plantoes → Medico ve seus plantoes → Faz check-in no plantao especifico
- App precisa de tela adicional para selecionar plantao (ou auto-detectar pelo horario)
- **Vantagem:** Controle total de escalas e ausencias
- **Desvantagem:** Mais complexo pro medico, precisa de tela extra no app

#### Opcao C: Hibrido
- Se medico tem plantao agendado para hoje: vincula ao plantao
- Se nao tem: cria walk-in automatico
- **Vantagem:** Melhor dos dois mundos
- **Desvantagem:** Logica mais complexa no backend

**Recomendacao:** Opcao C (Hibrido) com prioridade para plantao agendado.

---

## 4. Sobre a Biometria Facial

### Opcoes de implementacao

| Abordagem | Descricao | Custo | Complexidade |
|---|---|---|---|
| **Biometria local (Face ID/Fingerprint)** | Usa sensor do device, backend recebe token de confirmacao | Gratis | Baixa |
| **AWS Rekognition** | Envia selfie, compara com foto cadastrada | ~$1/1000 chamadas | Media |
| **SDK terceiro (FaceTec, iProov)** | Liveness detection + matching | $0.10-0.50/verificacao | Alta |

### Perguntas para a reuniao:
1. A biometria e para provar que o medico e ele mesmo (anti-fraude)? Ou e so conveniencia de login?
2. Se for anti-fraude: precisa de liveness detection (prova que e pessoa real, nao foto)?
3. Orcamento para servico de biometria?

**Se for so conveniencia:** usar Face ID/Fingerprint local (gratis, simples).  
**Se for anti-fraude:** AWS Rekognition ou FaceTec (pago, mais seguro).

---

## 5. Cronograma Estimado

### Sprint 2 — Integracao Basica (1-2 semanas)

| Tarefa | Dias | Prioridade |
|---|---|---|
| `GET /auth/session` (novo) | 0.5 | P0 |
| `GET /me` (adaptar) | 0.5 | P0 |
| `GET /units` (mapear clinics) | 0.5 | P0 |
| `GET /units/nearest` (geoloc) | 1 | P1 |
| `GET /attendance/records` (filtros) | 1 | P1 |
| `GET /attendance/summary` (agregacao) | 1.5 | P1 |
| Ajustar check-in/out (campo upaKey→clinicId) | 0.5 | P0 |
| **Total backend** | **~5.5 dias** | |

### Sprint 3 — Autenticacao Avancada (1 semana)

| Tarefa | Dias | Prioridade |
|---|---|---|
| Definir estrategia de biometria | 0.5 | P0 |
| `POST /auth/biometric` (implementar) | 2-3 | P0 |
| Login email/senha como fallback | 0.5 | P1 |
| **Total backend** | **~3-4 dias** | |

### Flutter (paralelo)

| Tarefa | Dias |
|---|---|
| Criar `ApiClient` com interceptors (token, retry, erro) | 1 |
| Implementar repositorios (Auth, Attendance, Units) | 2 |
| Substituir MockData por chamadas reais | 2 |
| Tratar erros (401 → biometria, 409 → alerta) | 1 |
| **Total app** | **~6 dias** |

---

## 6. Diagrama de Integracao

```
┌─────────────────────────────────────────────────────────────────────┐
│                         App Flutter 24p7                             │
│                                                                     │
│  [Splash] → [Biometria/Login] → [Home] → [Check-in/out] → [Relat.] │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS (JWT Bearer)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API PlantonHub (api.laulab.com.br)                │
│                                                                     │
│  /api/auth/*          → Autenticacao (login, logout, refresh, bio)  │
│  /api/users/me        → Perfil do medico (NOVO)                     │
│  /api/clinics         → Listar UPAs/clinicas                        │
│  /api/clinics/nearest → UPA mais proxima (NOVO)                     │
│  /api/attendance/*    → Check-in, check-out, status, records, sum.  │
│  /api/shifts/me/today → Plantoes de hoje (vincular check-in)        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              [PostgreSQL]  [Redis]    [AWS Rekognition?]
              Dados         Cache      Biometria (opcional)
```

---

## 7. Perguntas para Decisao na Reuniao

1. **Check-in: walk-in livre ou vinculado a plantao?** (Opcao A, B ou C)
2. **Biometria: conveniencia ou anti-fraude?** (define custo e complexidade)
3. **O app vai funcionar offline?** (se sim, precisa sync queue — ja temos infra)
4. **Prazo de entrega do app em producao?**
5. **Quantos medicos vao usar inicialmente?** (dimensionar infra)
6. **O login email/senha e necessario como fallback?** (primeiro acesso, device novo)

---

## 8. Resumo Executivo (para apresentacao rapida)

> **Backend: 70% pronto.** Das 12 rotas que o app precisa, 7 ja existem ou precisam apenas adaptacao minima. 4 precisam ser criadas (session, nearest, summary, biometric). Estimativa: **2 sprints (3 semanas)** para backend completo.
>
> **Decisao chave:** definir se check-in e por UPA (simples) ou por plantao (controle). Recomendamos hibrido.
>
> **Blocker:** estrategia de biometria precisa ser decidida antes de implementar.

---

*Documento preparado por Kiro — Julho 2026*

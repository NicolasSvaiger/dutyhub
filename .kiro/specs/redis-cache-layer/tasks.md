# Plano de Implementação: Redis Cache Layer

## Visão Geral

Implementação incremental da camada de cache Redis no PlantonHub, seguindo a ordem: infraestrutura Docker → backend (interfaces, implementações, middleware, integração nos controllers) → frontend (localStorage + retry queue) → verificação de integração. Cada tarefa é auto-contida e buildável ao final.

## Tarefas

- [x] 1. Configurar infraestrutura Redis no Docker Compose
  - [x] 1.1 Adicionar serviço Redis ao docker-compose.yml
    - Adicionar serviço `redis` com imagem `redis:7-alpine`, porta 6379, volume `redis_data`, healthcheck via `redis-cli ping`
    - Atualizar serviço `api` para depender do Redis com `condition: service_healthy`
    - Adicionar variáveis de ambiente `ConnectionStrings__Redis`, `CacheSettings__InstancePrefix`, `CacheSettings__DefaultTtlMinutes` ao serviço `api`
    - Adicionar volume `redis_data` na seção volumes
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Adicionar configuração Redis no appsettings.json
    - Adicionar `ConnectionStrings:Redis` com valor `localhost:6379` em `appsettings.Development.json`
    - Adicionar seção `CacheSettings` com `InstancePrefix` e `DefaultTtlMinutes`
    - _Requisitos: 2.2_

  - [x] 1.3 Adicionar pacote NuGet StackExchangeRedis
    - Adicionar `Microsoft.Extensions.Caching.StackExchangeRedis` ao projeto `PlantonHub.Infrastructure.csproj`
    - _Requisitos: 2.1_

- [x] 2. Implementar interfaces e serviços de cache na camada Application/Infrastructure
  - [x] 2.1 Criar interface ICacheService na camada Application
    - Criar `src/PlantonHub.Application/Interfaces/ICacheService.cs`
    - Métodos: `GetOrSetAsync<T>`, `GetAsync<T>`, `SetAsync<T>`, `RemoveAsync`, `RemoveByPrefixAsync`
    - _Requisitos: 2.1, 2.4, 2.5_

  - [x] 2.2 Criar interface ITokenBlacklistService na camada Application
    - Criar `src/PlantonHub.Application/Interfaces/ITokenBlacklistService.cs`
    - Métodos: `BlacklistTokenAsync(string jti, TimeSpan remainingTtl)`, `IsBlacklistedAsync(string jti)`
    - _Requisitos: 7.1, 7.2_

  - [x] 2.3 Implementar classe CacheKeys e CacheSettings na Infrastructure
    - Criar `src/PlantonHub.Infrastructure/Cache/CacheKeys.cs` com métodos estáticos para gerar chaves com prefixo e escopo (Clinics, Shifts, ShiftsUser, UserProfile, TokenBlacklist)
    - Criar `src/PlantonHub.Infrastructure/Cache/CacheSettings.cs` com propriedades `InstancePrefix` e `DefaultTtlMinutes`
    - _Requisitos: 2.3, 3.4, 4.4, 5.4_

  - [x] 2.4 Escrever testes de propriedade para geração de chaves de cache
    - **Propriedade 1: Chaves de cache incluem prefixo e escopo correto**
    - **Valida: Requisitos 2.3, 3.4, 4.4, 5.4**

  - [x] 2.5 Implementar RedisCacheService na Infrastructure
    - Criar `src/PlantonHub.Infrastructure/Cache/RedisCacheService.cs` implementando `ICacheService`
    - Usar `IDistributedCache` para operações de read/write
    - Serialização com `System.Text.Json`
    - Swallow exceptions em leituras (fallback graceful), log warning em escritas falhas
    - Implementar `RemoveByPrefixAsync` via `IConnectionMultiplexer` e SCAN
    - _Requisitos: 2.1, 2.3, 2.4, 2.5_

  - [x] 2.6 Escrever testes de propriedade para cache-aside e TTL
    - **Propriedade 2: Cache-aside retorna dados do cache quando disponíveis**
    - **Propriedade 3: Cache miss popula o cache com TTL correto**
    - **Valida: Requisitos 3.1, 3.2, 4.1, 4.2, 5.1, 5.2**

  - [x] 2.7 Implementar RedisTokenBlacklistService na Infrastructure
    - Criar `src/PlantonHub.Infrastructure/Cache/RedisTokenBlacklistService.cs` implementando `ITokenBlacklistService`
    - Usar `IDistributedCache` com TTL baseado no tempo restante de expiração do token
    - Armazenar apenas JTI como chave, "1" como valor
    - _Requisitos: 7.1, 7.4, 7.5_

  - [x] 2.8 Escrever testes de propriedade para token blacklist
    - **Propriedade 7: Token blacklist com TTL correto no logout**
    - **Valida: Requisitos 7.1, 7.4, 7.5**

- [x] 3. Checkpoint - Verificar build e testes unitários
  - Garantir que todos os testes passam e o projeto compila. Perguntar ao usuário se há dúvidas.

- [x] 4. Registrar serviços de cache no Program.cs e configurar middleware
  - [x] 4.1 Registrar Redis e serviços de cache no Program.cs
    - Adicionar `AddStackExchangeRedisCache` com configuração da connection string e prefixo
    - Registrar `ICacheService` → `RedisCacheService` e `ITokenBlacklistService` → `RedisTokenBlacklistService` como Scoped
    - Configurar `CacheSettings` via `builder.Services.Configure<CacheSettings>`
    - _Requisitos: 2.1, 2.2, 2.3_

  - [x] 4.2 Implementar TokenBlacklistMiddleware
    - Criar `src/PlantonHub.API/Middleware/TokenBlacklistMiddleware.cs`
    - Extrair JTI claim do token JWT autenticado
    - Consultar `ITokenBlacklistService.IsBlacklistedAsync`
    - Retornar 401 Unauthorized se token está na blacklist
    - Registrar no pipeline após `UseAuthentication()` e antes de `UseAuthorization()`
    - _Requisitos: 7.2, 7.3_

  - [x] 4.3 Escrever testes unitários para TokenBlacklistMiddleware
    - Testar extração de JTI, rejeição de token blacklisted, passagem de token válido
    - **Propriedade 8: Token blacklisted resulta em 401 Unauthorized**
    - **Valida: Requisitos 7.2, 7.3**

  - [x] 4.4 Implementar ETagActionFilter
    - Criar `src/PlantonHub.API/Filters/ETagActionFilter.cs` implementando `IAsyncActionFilter`
    - Calcular SHA256 hash do body de resposta para gerar ETag
    - Comparar com header `If-None-Match` e retornar 304 se match
    - Adicionar `Cache-Control: private, max-age=60` em respostas GET de listagem
    - Não adicionar headers em respostas de POST/PUT/DELETE
    - Registrar como filtro global ou nos controllers relevantes
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

  - [x] 4.5 Escrever testes de propriedade para ETag e Cache-Control headers
    - **Propriedade 5: ETag round-trip retorna 304 quando dados inalterados**
    - **Propriedade 6: Headers de cache presentes apenas em respostas GET**
    - **Valida: Requisitos 6.1, 6.2, 6.3, 6.4**

- [x] 5. Integrar cache nos Application Services e Controllers
  - [x] 5.1 Integrar cache no ClinicService e ClinicsController
    - Injetar `ICacheService` no `ClinicService`
    - Usar `GetOrSetAsync` com chave `CacheKeys.Clinics(clinicId)` no método de listagem
    - Invalidar cache (`RemoveAsync` / `RemoveByPrefixAsync`) em operações de criação e atualização
    - _Requisitos: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.2 Integrar cache no ShiftService e ShiftsController
    - Injetar `ICacheService` no `ShiftService`
    - Usar `GetOrSetAsync` com chave `CacheKeys.Shifts(clinicId)` e `CacheKeys.ShiftsUser(clinicId, userId)` nos métodos de listagem
    - Invalidar cache em operações de criação, atualização e modificação de atribuições
    - _Requisitos: 4.1, 4.2, 4.3, 4.4_

  - [x] 5.3 Integrar cache no UserService
    - Injetar `ICacheService` no `UserService`
    - Usar `GetOrSetAsync` com chave `CacheKeys.UserProfile(userId)` nas consultas de perfil
    - Invalidar cache quando perfis ou roles são modificados
    - _Requisitos: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.4 Escrever testes de propriedade para invalidação de cache
    - **Propriedade 4: Operações de escrita invalidam entradas de cache relacionadas**
    - **Valida: Requisitos 3.3, 4.3, 5.3**

  - [x] 5.5 Implementar endpoint de logout no AuthController
    - Adicionar `POST /api/auth/logout` com atributo `[Authorize]`
    - Extrair JTI e tempo de expiração do token atual via claims
    - Chamar `ITokenBlacklistService.BlacklistTokenAsync(jti, remainingTtl)`
    - Retornar 204 No Content
    - _Requisitos: 7.1, 7.4, 7.5_

- [x] 6. Checkpoint - Verificar integração backend completa
  - Garantir que todos os testes passam, o projeto compila, e o docker-compose sobe corretamente com Redis. Perguntar ao usuário se há dúvidas.

- [x] 7. Implementar cache local e retry queue no Frontend
  - [x] 7.1 Implementar persistência de sessão no localStorage
    - Atualizar `AuthContext.tsx` para salvar token JWT e refresh token no localStorage após login
    - Armazenar dados do perfil do usuário (nome, email, perfis) no localStorage
    - Armazenar clínica ativa selecionada no localStorage (atualizar `ClinicContext.tsx`)
    - Limpar localStorage completo em logout e quando refresh token falha
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 7.2 Implementar módulo RetryQueue para operações offline
    - Criar `frontend/public/js/retryQueue.js` com IIFE ou ES module
    - Implementar métodos: `enqueue`, `dequeue`, `getAll`, `size`, `flush`
    - Limitar fila a máximo 20 operações
    - Registrar listener `window.addEventListener('online', ...)` para flush automático
    - Processar operações em ordem FIFO
    - _Requisitos: 9.1, 9.3, 9.7_

  - [x] 7.3 Integrar RetryQueue nas operações de check-in/check-out
    - Atualizar lógica de check-in/check-out para enfileirar em caso de falha de rede
    - Exibir indicação visual de operações pendentes (badge ou toast)
    - Remover operações da fila em sucesso (2xx) ou erro de negócio (4xx)
    - Manter operações na fila em erro de rede para retry posterior
    - Notificar usuário sobre falhas de negócio com detalhes do erro
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 7.4 Escrever testes de propriedade para RetryQueue (JavaScript)
    - **Propriedade 9: Retry queue enfileira operações em falha de rede**
    - **Propriedade 10: Retry queue processa em ordem FIFO**
    - **Propriedade 11: Resolução de retry remove ou mantém conforme resultado**
    - **Propriedade 12: Retry queue respeita limite de capacidade**
    - Usar fast-check como biblioteca PBT
    - Criar `frontend/public/js/retryQueue.test.js`
    - **Valida: Requisitos 9.1, 9.3, 9.4, 9.5, 9.6, 9.7**

- [x] 8. Testes de integração end-to-end
  - [x] 8.1 Escrever testes de integração para cache-aside
    - Testar fluxo completo: GET → cache miss → GET → cache hit → POST → cache invalidado → GET → dados frescos
    - Usar Testcontainers com Redis e PostgreSQL
    - _Requisitos: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

  - [x] 8.2 Escrever testes de integração para ETag e 304
    - Testar fluxo: GET → extrair ETag → GET com If-None-Match → 304 Not Modified
    - Testar ausência de headers em respostas POST/PUT/DELETE
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

  - [x] 8.3 Escrever testes de integração para token blacklist
    - Testar fluxo: login → logout → request com token antigo → 401 Unauthorized
    - Testar que token não blacklisted continua funcionando
    - _Requisitos: 7.1, 7.2, 7.3_

  - [x] 8.4 Escrever testes de integração para fallback (Redis indisponível)
    - Testar que GET funciona via banco quando Redis está parado
    - Testar que operações de escrita prosseguem normalmente sem Redis
    - _Requisitos: 2.4, 2.5_

- [x] 9. Checkpoint final - Validação completa
  - Garantir que todos os testes passam (unitários, propriedades, integração), docker-compose sobe com todos os serviços saudáveis, e a aplicação funciona end-to-end. Perguntar ao usuário se há dúvidas.

- [x] 10. Implementar suporte Offline First para check-in/check-out no Mobile
  - [x] 10.1 Criar fila local de eventos offline no mobile
    - Criar armazenamento local para eventos pendentes de sincronização
    - Salvar eventos de check-in/check-out quando a internet falhar
    - Campos mínimos do evento offline:
      - `LocalEventId` (UUID gerado no dispositivo)
      - `UserId`
      - `ClinicId`
      - `ShiftId`
      - `AttendanceType` (CheckIn/CheckOut)
      - `LocalDateTime` (horário local do dispositivo)
      - `Latitude`
      - `Longitude`
      - `DeviceId`
      - `AppVersion`
      - `BiometricValidated`
      - `SyncStatus` (Pending/Synced/Failed)
      - `RetryCount`
      - `LastSyncAttemptAt`

  - [x] 10.2 Criar endpoint de sincronização no backend
    - Criar endpoint `POST /api/attendance/sync` com atributo `[Authorize]`
    - Receber lista de eventos offline no body (batch sync)
    - Processar cada evento individualmente
    - Retornar status de sincronização por evento (sucesso, rejeitado, duplicado, requer revisão)
    - Não duplicar registros já sincronizados (idempotência via LocalEventId + UserId + DeviceId)

  - [x] 10.3 Implementar idempotência
    - Usar combinação de `LocalEventId`, `UserId` e `DeviceId` como chave de unicidade
    - Garantir que reenvio do mesmo evento não gere duplicidade
    - Salvar eventos recebidos na tabela `OfflineAttendanceEvent`
    - Usar Redis como lock temporário distribuído durante processamento (não como fonte da verdade)

  - [x] 10.4 Criar validação de eventos offline
    - Validar se usuário pertence à clínica informada
    - Validar se usuário está vinculado ao plantão informado
    - Validar ordem temporal: check-in antes de check-out
    - Validar localização dentro do raio permitido da clínica
    - Validar se biometria foi confirmada localmente
    - Validar diferença entre horário local do dispositivo e horário do servidor (clock skew)

  - [x] 10.5 Criar status de sincronização
    - Implementar enum `SyncStatus` com valores:
      - `OnlineSynced` — registrado online em tempo real
      - `OfflineSynced` — registrado offline e sincronizado com sucesso
      - `OfflineSyncedLate` — sincronizado offline com atraso significativo
      - `RequiresReview` — sincronizado mas com flags de alerta (requer revisão manual)
      - `Rejected` — rejeitado por falha de validação
      - `DuplicateIgnored` — evento duplicado já processado anteriormente

  - [x] 10.6 Adicionar flags antifraude
    - Detectar e sinalizar as seguintes condições suspeitas:
      - Evento offline muito antigo (> N horas desde LocalDateTime)
      - Diferença grande entre horário local e horário do servidor (clock skew)
      - Localização fora do raio permitido da clínica
      - DeviceId diferente do habitualmente utilizado pelo usuário
      - Biometria não validada localmente
      - AppVersion desatualizada (abaixo da versão mínima)
      - Múltiplas tentativas duplicadas do mesmo evento (replay attack)
    - Eventos com flags resultam em `RequiresReview`

  - [x] 10.7 Criar auditoria da sincronização offline
    - Registrar log de auditoria para cada evento sincronizado contendo:
      - `UserId`, `ClinicId`, `ShiftId`
      - `LocalEventId`
      - `LocalDateTime` (do dispositivo)
      - `ReceivedAtServer` (timestamp do servidor)
      - `DeviceId`, `IP`, `UserAgent`
      - `Latitude`, `Longitude`
      - Resultado da validação (aceito, rejeitado, requer revisão)
      - Motivo de rejeição ou revisão (quando aplicável)

  - [x] 10.8 Ajustar tabela Attendance
    - Adicionar campos à tabela existente `Attendance`:
      - `CheckInLocalDateTime` (horário local do dispositivo no check-in)
      - `CheckInServerDateTime` (horário do servidor no check-in)
      - `CheckOutLocalDateTime` (horário local do dispositivo no check-out)
      - `CheckOutServerDateTime` (horário do servidor no check-out)
      - `SyncSource` (Online/Offline)
      - `SyncStatus` (enum criado em 10.5)
      - `RequiresReview` (bool)
      - `ReviewReason` (string nullable)
    - Criar migration EF Core correspondente

  - [x] 10.9 Criar tabela OfflineAttendanceEvent
    - Criar migration EF Core com a tabela `OfflineAttendanceEvent`:
      - `OfflineAttendanceEventId` (PK, UUID)
      - `LocalEventId` (UUID gerado no dispositivo)
      - `UserId` (FK → Users)
      - `ClinicId` (FK → Clinics)
      - `ShiftId` (FK → Shifts)
      - `AttendanceType` (CheckIn/CheckOut)
      - `LocalDateTime` (horário do dispositivo)
      - `ReceivedAtServer` (timestamp do servidor)
      - `Latitude`, `Longitude`
      - `DeviceId`, `AppVersion`
      - `BiometricValidated` (bool)
      - `SyncStatus` (enum)
      - `ValidationStatus` (Passed/Failed/RequiresReview)
      - `ValidationMessages` (JSON array de mensagens)
      - `IsDuplicate` (bool)
      - `RequiresReview` (bool)
      - `CreatedAt`
    - Adicionar índice único em (`LocalEventId`, `UserId`, `DeviceId`)

  - [x] 10.10 Integrar Redis de forma segura
    - Usar Redis apenas para:
      - Lock distribuído por usuário/plantão durante processamento de sync (evitar race conditions)
      - Idempotência temporária (TTL curto para detectar reenvios imediatos)
      - Rate limit de sincronização por usuário/dispositivo
    - **Não** usar Redis como fonte da verdade — PostgreSQL permanece como source of truth
    - Garantir fallback graceful se Redis estiver indisponível (operação prossegue, apenas sem lock distribuído)

  - [x] 10.11 Atualizar frontend/mobile
    - Detectar status da internet (online/offline events)
    - Enfileirar check-in/check-out em armazenamento local quando offline
    - Sincronizar automaticamente quando a conexão voltar (evento `online`)
    - Permitir sincronização manual via botão na UI
    - Exibir lista de operações pendentes para o usuário com status individual
    - Exibir indicador visual de modo offline ativo

  - [x] 10.12 Criar testes
    - Testes unitários e de integração cobrindo:
      - Check-in online (fluxo normal)
      - Check-in offline sincronizado depois (sucesso)
      - Check-out offline sincronizado depois (sucesso)
      - Evento duplicado (LocalEventId repetido → DuplicateIgnored)
      - Localização inválida (fora do raio → Rejected ou RequiresReview)
      - Biometria falsa (não validada → RequiresReview)
      - Evento antigo demais (clock skew excessivo → RequiresReview)
      - Evento de outro usuário (UserId não pertence à clínica → Rejected)
      - Redis indisponível (fallback graceful, operação prossegue)
      - Reenvio do mesmo LocalEventId (idempotência garantida)
    - Testes de propriedade com FsCheck:
      - **Propriedade 13: Idempotência — mesmo LocalEventId nunca gera duplicidade**
      - **Propriedade 14: Validação rejeita eventos com localização fora do raio**
      - **Propriedade 15: Eventos com flags antifraude recebem RequiresReview**

  - [x] 10.13 Atualizar README
    - Explicar fluxo offline-first (check-in → armazenamento local → sync quando online)
    - Explicar quando o evento recebe status `RequiresReview`
    - Explicar diferença entre horário local e horário do servidor (clock skew)
    - Explicar como testar internet offline (DevTools, network throttling)
    - Explicar como Redis participa do fluxo (locks, idempotência, rate limit)

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Testes de propriedade validam comportamentos universais de corretude
- Testes unitários validam cenários específicos e edge cases
- A ordem de implementação garante que cada passo é compilável e testável independentemente

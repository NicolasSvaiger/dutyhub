# DutyHub API — Contrato para o App Flutter (24p7)

**Base URL:** `https://api.laulab.com.br`
**Autenticação:** Bearer Token — ID Token do Cognito
**Formato:** JSON (`Content-Type: application/json`)
**Fuso:** Todos os `DateTime` em UTC (ISO 8601, ex.: `2026-07-15T08:30:00Z`)

---

## Sumário

1. [Autenticação (Cognito)](#1-autenticação-cognito)
2. [Perfil do usuário](#2-perfil-do-usuário)
3. [Clínicas / UPAs](#3-clínicas--upas)
4. [Plantões (shifts)](#4-plantões-shifts)
5. [Presença — check-in / check-out](#5-presença--check-in--check-out)
6. [Biometria facial](#6-biometria-facial)
7. [Gerenciamento de dispositivo](#7-gerenciamento-de-dispositivo)
8. [Sincronização offline](#8-sincronização-offline)
9. [Fluxos-chave (login, check-in, sync)](#9-fluxos-chave)
10. [Códigos de erro](#10-códigos-de-erro)
11. [Configurações](#11-configurações)

---

## 1. Autenticação (Cognito)

O app **não** chama endpoints de login do backend com email+senha — a autenticação é feita direto no AWS Cognito via o SDK oficial. O backend só emite ID Token depois disso.

### Configuração Cognito

```
Region:    us-east-1
User Pool: us-east-1_0PARyV1xj
Client ID: 3g1hnk76ksd3cbt8aqlio0bb87
```

Recomendação de pacote Flutter: `amazon_cognito_identity_dart_2` (mesma família do SDK JS usado no frontend web, mesmo comportamento de refresh automático).

### Header padrão em todas as chamadas autenticadas

```
Authorization: Bearer <ID_TOKEN>
```

Claims esperados no ID Token (injetados por Lambda pre-token no Cognito):

| Claim | Descrição |
|---|---|
| `sub` | UUID do Cognito (nem sempre igual ao `User.Id` local) |
| `email` | E-mail do usuário |
| `name` | Nome completo |
| `cognito:groups` | Grupos Cognito (`Medico`, `Enfermeiro`, `Tecnico`, ...) |
| `roles` | Array JSON ou CSV dos roles reais (custom claim) |
| `clinicIds` | Array JSON dos IDs das clínicas autorizadas |
| `jti` | Token ID (usado para blacklist no logout) |

### 1.1. Face-login (login por selfie — profissionais)

`POST /api/auth/face-login`

**Auth:** anônimo. Único endpoint de login que não passa pelo Cognito SDK direto.
Só profissionais (Medico, Enfermeiro, Tecnico). Admins usam email+senha via Cognito SDK.

**Pré-requisito:** admin deve ter chamado `POST /api/auth/setup-face-login/{userId}` + `POST /api/biometric/enroll/{userId}` antes.

**Request:**
```json
{
  "email": "medico@exemplo.com",
  "embedding": [0.012, -0.045, 0.089, ... /* 128 floats */],
  "deviceId": "a1b2c3d4-unique-device-id",
  "platform": "android",
  "deviceModel": "Samsung Galaxy S24"
}
```

**Response 200:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJl...",
  "expiresIn": 3600,
  "userId": "a1b2c3d4-...",
  "email": "medico@exemplo.com",
  "name": "Dr. João Silva"
}
```

**Erros:**
- `400` — face-login não habilitado (usuário é admin, ou setup não foi feito)
- `401` — face não bate (confidence baixa) ou enrollment inexistente
- `403` — device diferente do vinculado (`DEVICE_LOCKED`)
- `429` — rate limit (5 tentativas/min por IP)

Detalhes completos no [Guia de Biometria](flutter-biometric-api.md).

### 1.2. Validar sessão

`GET /api/auth/session`

Use no app launch para decidir se o token ainda vale.

**Response 200:**
```json
{
  "userId": "a1b2c3d4-...",
  "email": "medico@exemplo.com",
  "name": "Dr. João Silva",
  "roles": ["Medico"],
  "clinicIds": ["guid-clinica-1", "guid-clinica-2"]
}
```

**401** — token inválido, expirado ou revogado. Faz refresh (se possível) ou volta pra login.

Rate limit: 60 req/min por usuário.

### 1.3. Logout

`POST /api/auth/logout`

Coloca o token atual na blacklist do Redis. Requests subsequentes com esse mesmo token retornam 401.

**Request:** vazio (usa o token do header)

**Response 204** — sem body

O refresh token continua funcionando — se quiser desativar sessão totalmente, apague-o do storage local do app.

### 1.4. Refresh de token

Feito pelo SDK Cognito no cliente, **não pelo backend**. O SDK detecta que o ID Token está prestes a expirar e chama Cognito direto para renovar usando o refresh token guardado.

Configuração do TTL:

- ID Token: 1 hora
- Access Token: 1 hora
- Refresh Token: 30 dias

Se o refresh token expirar (30 dias sem uso), obrigar novo login.

---

## 2. Perfil do usuário

### 2.1. Perfil completo do próprio usuário

`GET /api/users/me`

**Auth:** qualquer autenticado

**Response 200:**
```json
{
  "id": "a1b2c3d4-...",
  "name": "Dr. João Silva",
  "email": "medico@exemplo.com",
  "professionalType": "Medico",
  "isActive": true,
  "cpf": "12345678900",
  "phone": "11987654321",
  "registrationNumber": "CRM-SP 123456",
  "specialty": "Clínica Geral",
  "employmentType": "CLT",
  "dateOfBirth": "1990-05-15T00:00:00Z",
  "createdAt": "2026-01-10T08:00:00Z",
  "updatedAt": "2026-06-20T14:30:00Z",
  "roles": [
    {
      "id": "role-guid",
      "userId": "a1b2c3d4-...",
      "clinicId": "clinic-guid",
      "role": "Medico",
      "assignedAt": "2026-01-10T08:00:00Z"
    }
  ]
}
```

Use este endpoint quando precisar dos campos completos (CPF, telefone, CRM, especialidade, etc.). Para o essencial de login/session use `GET /api/auth/session` (menor payload, mesmo cache).

**404** — usuário não existe mais no banco (foi deletado). App deve fazer logout.

---

## 3. Clínicas / UPAs

### 3.1. Listar clínicas autorizadas

`GET /api/clinics`

**Auth:** qualquer autenticado

Retorna somente as clínicas às quais o usuário está vinculado (via `clinicIds` do JWT).

**Response 200:**
```json
[
  {
    "id": "clinic-guid",
    "name": "UPA Centro",
    "address": "Rua X, 123",
    "phone": "1140001111",
    "latitude": -23.5501,
    "longitude": -46.6302,
    "isActive": true,
    "hasNursing": true
  }
]
```

Headers de cache:
- `Cache-Control: private, max-age=60`
- `ETag: "<hash>"` — reenvie via `If-None-Match` para receber 304.

### 3.2. Clínica mais próxima

`GET /api/clinics/nearest?latitude={lat}&longitude={lng}&limit={n}`

Retorna as clínicas autorizadas do usuário ordenadas por distância. Use na home do app para sugerir a UPA correta.

**Query params:**
- `latitude` (obrigatório, `-90..90`)
- `longitude` (obrigatório, `-180..180`)
- `limit` (opcional, default 5)

**Response 200:**
```json
[
  {
    "id": "clinic-guid",
    "name": "UPA Centro",
    "address": "Rua X, 123",
    "latitude": -23.5501,
    "longitude": -46.6302,
    "distanceMeters": 120.5,
    "withinRadius": true
  },
  {
    "id": "clinic-guid-2",
    "name": "UPA Norte",
    "address": "Av Y, 456",
    "latitude": -23.52,
    "longitude": -46.61,
    "distanceMeters": 3850.2,
    "withinRadius": false
  }
]
```

**Regra:**
- `withinRadius == true` → habilita check-in nessa clínica.
- Se todas `false` → mostrar aviso "Você não está próximo de nenhuma unidade".

---

## 4. Plantões (shifts)

### 4.1. Meus plantões (todos)

`GET /api/shifts/me`

**Auth:** profissional

Todos os plantões atribuídos ao profissional (histórico + futuros), em todas as clínicas.

**Response 200:**
```json
[
  {
    "id": "shift-guid",
    "clinicId": "clinic-guid",
    "title": "Plantão Matutino",
    "date": "2026-07-15T00:00:00Z",
    "startTime": "07:00:00",
    "endTime": "13:00:00",
    "createdAt": "2026-07-01T10:00:00Z",
    "assignments": [
      {
        "id": "assign-guid",
        "userId": "user-guid",
        "userName": "Dr. João Silva",
        "assignedAt": "2026-07-01T10:00:00Z"
      }
    ]
  }
]
```

Cache: 60s + ETag.

### 4.2. Plantões de hoje

`GET /api/shifts/me/today`

**Auth:** profissional
**Header opcional:** `X-Clinic-Id: <guid>` — filtra por clínica ativa

Retorna apenas os shifts atribuídos ao profissional cuja `date` é hoje. Base para decidir se pode fazer check-in.

**Response 200:** mesma shape de `GET /api/shifts/me`

Se `X-Clinic-Id` presente e a clínica não é autorizada → **200 com lista vazia** (silent reject, não 403).

---

## 5. Presença — check-in / check-out

### 5.1. Status unificado

`GET /api/attendance/status`

Um único GET responde "qual o estado agora?" — evita race conditions de múltiplas chamadas.

**Auth:** profissional
**Header opcional:** `X-Clinic-Id: <guid>`

**Response 200:**
```json
{
  "hasActiveCheckIn": false,
  "canCheckIn": true,
  "canCheckOut": false,
  "activeAttendance": null,
  "availableShiftsToday": [
    {
      "shiftId": "shift-guid",
      "clinicId": "clinic-guid",
      "title": "Plantão Matutino",
      "startTime": "07:00:00",
      "endTime": "13:00:00"
    }
  ]
}
```

Quando há check-in aberto:
```json
{
  "hasActiveCheckIn": true,
  "canCheckIn": false,
  "canCheckOut": true,
  "activeAttendance": {
    "id": "attendance-guid",
    "shiftId": "shift-guid",
    "clinicId": "clinic-guid",
    "clinicName": "UPA Centro",
    "checkInTime": "2026-07-15T07:03:22Z"
  },
  "availableShiftsToday": []
}
```

### 5.2. Check-in

`POST /api/attendance/check-in`

**Auth:** profissional
**Rate limit:** 10/min por usuário

**Request:**
```json
{
  "shiftId": "shift-guid",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "deviceId": "unique-device-id",
  "biometricValidated": true,
  "biometricProofToken": "server-issued-token-from-verify"
}
```

Campos:
- `shiftId` — obtido de `AttendanceStatus.availableShiftsToday` ou `shifts/me/today`
- `latitude`/`longitude` — GPS atual do device
- `deviceId` — ID único e estável do device (ver seção 7)
- `biometricValidated` — flag informativa
- `biometricProofToken` — **obrigatório se o usuário tem face enrollment**. Vem do response de `POST /api/biometric/verify`. Impede bypass da biometria com flag forjada.

**Response 201:**
```json
{
  "id": "attendance-guid",
  "userId": "user-guid",
  "shiftId": "shift-guid",
  "clinicId": "clinic-guid",
  "checkInTime": "2026-07-15T07:03:22Z",
  "checkInLatitude": -23.5505,
  "checkInLongitude": -46.6333,
  "checkInDeviceId": "unique-device-id",
  "biometricValidated": true,
  "checkOutTime": null,
  "checkOutLatitude": null,
  "checkOutLongitude": null,
  "checkOutDeviceId": null
}
```

**Erros:**
- `400` — biometria obrigatória mas `biometricProofToken` ausente/inválido
- `403` — profissional não está atribuído ao shift
- `409` — já existe check-in ativo (em qualquer clínica). Corpo contém detalhe do ativo pra você mostrar mensagem "você já tem check-in aberto na UPA X"

### 5.3. Check-out

`POST /api/attendance/check-out`

**Auth:** profissional

**Request:**
```json
{
  "shiftId": "shift-guid",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "deviceId": "unique-device-id"
}
```

**Response 200:** mesma shape do check-in, com campos `checkOut*` preenchidos.

**400** — não há check-in ativo para este shift.

### 5.4. Check-ins ativos

`GET /api/attendance/active`

Lista todos os check-ins abertos do profissional (cross-clinic).

**Response 200:**
```json
[
  {
    "id": "attendance-guid",
    "userId": "user-guid",
    "shiftId": "shift-guid",
    "clinicId": "clinic-guid",
    "checkInTime": "2026-07-15T07:03:22Z",
    "checkInLatitude": -23.5505,
    "checkInLongitude": -46.6333,
    "checkInDeviceId": "device-id",
    "biometricValidated": true,
    "checkOutTime": null,
    "checkOutLatitude": null,
    "checkOutLongitude": null,
    "checkOutDeviceId": null
  }
]
```

### 5.5. Histórico

`GET /api/attendance/my-history`

**Response 200:** array de `AttendanceResponse`, ordenado por `checkInTime` descendente. Inclui todas as clínicas em que o profissional trabalhou.

Cache: 60s + ETag.

> **Nota:** Filtros `?from`, `?to`, `?clinicId` e paginação **ainda não estão implementados**. Se o app precisar, avisar para implementarmos.

### 5.6. Resumo agregado

`GET /api/attendance/summary?from={iso}&to={iso}`

**Auth:** profissional
**Query params:** `from` e `to` opcionais (sem eles, retorna tudo).

**Response 200:**
```json
{
  "totalDaysWorked": 18,
  "totalHoursWorked": 144.5,
  "totalAbsences": 2,
  "totalShiftsAssigned": 20,
  "averageHoursPerDay": 8.03,
  "fromDate": "2026-07-01T00:00:00Z",
  "toDate": "2026-07-31T00:00:00Z"
}
```

Use na home + tela de relatórios.

---

## 6. Biometria facial

Documentação completa no [Guia de Biometria](flutter-biometric-api.md). Resumo dos endpoints:

### 6.1. Verificar se tem enrollment

`GET /api/biometric/status`

**Response 200:** `{ "enrolled": true }`

### 6.2. Cadastrar face (self)

`POST /api/biometric/enroll/me`

**Request:**
```json
{
  "embedding": [0.012, -0.045, ... /* 128 floats */],
  "photoBase64": "data:image/jpeg;base64,/9j/4A..."
}
```

### 6.3. Verificar face no check-in

`POST /api/biometric/verify`

**Rate limit:** 10/min por usuário

**Request:**
```json
{
  "embedding": [0.015, -0.042, ...]
}
```

**Response 200:**
```json
{
  "isMatch": true,
  "confidence": 0.87,
  "proofToken": "server-issued-token-usable-once-in-check-in"
}
```

Guarde o `proofToken` e envie no check-in imediatamente depois. Ele é single-use e expira em 60s.

### 6.4. Deletar enrollment (LGPD)

`DELETE /api/biometric/enroll/me`

**Response 204**

---

## 7. Gerenciamento de dispositivo

Cada profissional só pode ter **1 device ativo** por vez. O primeiro face-login registra automaticamente; login em outro device sem reset é bloqueado.

### 7.1. Device ID no Flutter

```yaml
# pubspec.yaml
dependencies:
  device_info_plus: ^10.1.0
```

```dart
Future<String> getDeviceId() async {
  final deviceInfo = DeviceInfoPlugin();
  if (Platform.isAndroid) {
    final android = await deviceInfo.androidInfo;
    return android.id; // único por device+app
  } else if (Platform.isIOS) {
    final ios = await deviceInfo.iosInfo;
    return ios.identifierForVendor ?? '';
  }
  throw UnsupportedError('Platform not supported');
}
```

### 7.2. Self-service reset

`POST /api/auth/reset-device`

Desvincula o device atual (o usuário está logado nele). Precisa ficar deslogado depois.

**Request:**
```json
{ "reason": "Troca de celular" }
```

**Response 204**

### 7.3. Admin reset

`POST /api/auth/reset-device/{userId}` — admin desvincula outro usuário. Não é chamado pelo app do profissional, mas o app pode mostrar mensagem `code: "DEVICE_LOCKED"` do face-login orientando o usuário a pedir para o admin.

---

## 8. Sincronização offline

Quando o dispositivo perde conexão, o app enfileira eventos localmente e chama o endpoint de sync assim que a rede volta.

### 8.1. Fila local (client-side)

Cada evento deve conter:

```json
{
  "localEventId": "uuid-gerado-no-device",
  "userId": "user-guid",
  "clinicId": "clinic-guid",
  "shiftId": "shift-guid",
  "attendanceType": "CheckIn",
  "localDateTime": "2026-07-15T07:03:22Z",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "deviceId": "device-id",
  "appVersion": "1.4.2",
  "biometricValidated": true
}
```

- `localEventId` gera com `Uuid().v4()` no cliente. Chave de idempotência — reenvios do mesmo `localEventId` não geram duplicata.
- `attendanceType`: `"CheckIn"` ou `"CheckOut"`.
- `localDateTime`: horário do device no momento da ação. O backend guarda separado do `serverDateTime` e alerta se a diferença for grande (clock skew).

### 8.2. Envio em batch

`POST /api/attendance/sync`

**Auth:** qualquer autenticado
**Rate limit:** default (60/min)

**Request:**
```json
{
  "events": [
    { "localEventId": "...", "attendanceType": "CheckIn", ... },
    { "localEventId": "...", "attendanceType": "CheckOut", ... }
  ]
}
```

**Response 200:**
```json
{
  "results": [
    {
      "localEventId": "uuid-1",
      "status": "OfflineSynced",
      "attendanceId": "attendance-guid",
      "requiresReview": false
    },
    {
      "localEventId": "uuid-2",
      "status": "DuplicateIgnored",
      "attendanceId": "attendance-guid-existente",
      "requiresReview": false
    },
    {
      "localEventId": "uuid-3",
      "status": "RequiresReview",
      "attendanceId": "attendance-guid",
      "requiresReview": true,
      "reviewReason": "Clock skew de 6h30 entre device e servidor"
    },
    {
      "localEventId": "uuid-4",
      "status": "Rejected",
      "attendanceId": null,
      "requiresReview": false,
      "rejectionReason": "Usuário não atribuído ao plantão"
    }
  ]
}
```

### 8.3. Status possíveis

| Status | Ação no app |
|---|---|
| `OnlineSynced` | Não aparece no sync (só via check-in normal) |
| `OfflineSynced` | Remover da fila local |
| `OfflineSyncedLate` | Remover da fila. Considerar mostrar aviso ao usuário. |
| `RequiresReview` | Remover da fila. Backend vai auditar. |
| `Rejected` | Remover da fila. Mostrar erro ao usuário com `rejectionReason`. |
| `DuplicateIgnored` | Remover da fila (já foi sincronizado antes). |

Regra prática no app: qualquer status ≠ `PendingSync` → remove da fila local.

### 8.4. Quando um evento vira `RequiresReview`

Flags antifraude que o backend detecta:

- Evento muito antigo (`localDateTime` distante do server time)
- Clock skew excessivo
- Localização GPS fora do raio permitido da clínica
- `deviceId` incomum para o usuário
- Biometria não validada localmente
- `appVersion` desatualizada
- Múltiplos reenvios do mesmo `localEventId`

O evento é aceito (attendance criado) mas com flag pra admin revisar. Não é rejeição — não faça o usuário refazer.

---

## 9. Fluxos-chave

### 9.1. Primeiro login

```
1. Tela de email → usuário informa email
2. Câmera → captura selfie → gera embedding (MobileFaceNet, 128-dim)
3. POST /api/auth/face-login { email, embedding, deviceId, platform, deviceModel }
   → 200 { idToken, accessToken, refreshToken, ... }
4. Salvar tokens no Secure Storage (flutter_secure_storage)
5. GET /api/users/me → guardar perfil completo em cache local
6. GET /api/clinics/nearest → sugerir UPA
7. Redireciona pra home
```

### 9.2. App launch (usuário já logado)

```
1. Ler idToken do Secure Storage
2. GET /api/auth/session
   → 200: token válido, seguir
   → 401: refresh via Cognito SDK
       → sucesso: retry com novo token
       → falha (refresh expirado): volta pra tela de login
3. GET /api/attendance/status → decidir home
4. GET /api/clinics/nearest → sugerir UPA no card
```

### 9.3. Check-in

```
1. GET /api/attendance/status → confirma canCheckIn=true
2. Escolhe shift (de availableShiftsToday) e UPA (de nearest)
3. GET geolocation atual
4. Se tem enrollment (checou antes via /biometric/status):
   a. Câmera → captura selfie → embedding
   b. POST /api/biometric/verify { embedding }
      → 200 { isMatch, confidence, proofToken }
      → se !isMatch: mostra erro, permite nova tentativa
      → se isMatch: guarda proofToken (validade 60s)
   c. POST /api/attendance/check-in { shiftId, lat, lng, deviceId, biometricValidated: true, biometricProofToken }
      → 201 { attendance }
5. Se não tem enrollment:
   a. POST /api/attendance/check-in { ..., biometricValidated: false, biometricProofToken: null }
      → 201 OK (backend permite quando usuário nunca fez enrollment)
6. Mostra tela de confirmação com hora, UPA e status
```

### 9.4. Check-in offline

```
1. GET /api/attendance/status falha (timeout / sem rede)
2. App detecta offline (connectivity_plus + ping fallback)
3. Mostra aviso "Modo offline — a batida vai sincronizar quando voltar a rede"
4. Gera localEventId (uuid v4)
5. Enfileira em Hive/SQLite local:
   { localEventId, attendanceType: "CheckIn", shiftId, lat, lng, deviceId, appVersion, localDateTime: now, biometricValidated }
6. Mostra confirmação local (checkmark verde com badge "sync pendente")
7. Ao voltar a rede (connectivity_plus stream):
   a. Coleta todos os eventos com status Pending
   b. POST /api/attendance/sync { events: [...] }
      → 200 { results }
   c. Para cada result, remove da fila local (ver tabela status)
   d. Se algum status foi Rejected, mostra notificação com rejectionReason
```

### 9.5. Renovação de token em background

O SDK Cognito faz isso automaticamente. Configuração recomendada:

```dart
// Renovar 5min antes de expirar
const refreshBufferSeconds = 300;

Future<String> getValidIdToken() async {
  final session = await Amplify.Auth.fetchAuthSession();
  final tokens = session.userPoolTokensResult.valueOrNull;
  if (tokens == null) throw AuthException('Not signed in');

  final expiresAt = tokens.idToken.claims.expiration!;
  final now = DateTime.now().toUtc();
  final secondsToExpiry = expiresAt.difference(now).inSeconds;

  if (secondsToExpiry < refreshBufferSeconds) {
    // Force refresh
    final refreshed = await Amplify.Auth.fetchAuthSession(
      options: FetchAuthSessionOptions(forceRefresh: true),
    );
    return refreshed.userPoolTokensResult.value.idToken.raw;
  }

  return tokens.idToken.raw;
}
```

Usar esse método em um interceptor do `Dio` (ou equivalente) para sempre ter token válido.

---

## 10. Códigos de erro

### Códigos HTTP

| HTTP | Significado | Ação no app |
|---|---|---|
| `200` / `201` / `204` | Sucesso | Continua |
| `400` | Payload inválido ou faltando | Mostra erro; se `biometricProofToken` faltando, refaz `/verify` |
| `401` | Token inválido / expirado / blacklist | Refresh via Cognito, ou logout |
| `403` | Sem permissão (role errado, clinic não autorizada, `DEVICE_LOCKED`) | Ver campo `code` — decidir por tela específica |
| `404` | Recurso não existe | Mostra "não encontrado" |
| `409` | Conflito (check-in duplicado, etc.) | Mostra detalhe do conflito do body |
| `429` | Rate limit | Header `Retry-After` indica quantos segundos aguardar |
| `500` / `502` / `503` | Erro do backend / infra | Mostrar mensagem genérica + retry com backoff |

### Códigos de negócio (campo `code` no body)

Alguns 403s têm `code` no body para distinção fina:

- `DEVICE_LOCKED` — face-login rejeitado porque device é outro. Body inclui dados do device vinculado + link para self-reset ou admin-reset.
- `ACTIVE_CHECKIN_EXISTS` — check-in duplicado. Body inclui dados do check-in ativo (clínica + hora).

Formato do body em erros:

```json
{
  "message": "Mensagem legível em pt-BR",
  "code": "DEVICE_LOCKED",
  "currentDevice": { ... }
}
```

---

## 11. Configurações

### 11.1. Timeouts sugeridos no Dio

```dart
final dio = Dio(BaseOptions(
  baseUrl: 'https://api.laulab.com.br',
  connectTimeout: Duration(seconds: 10),
  receiveTimeout: Duration(seconds: 15),  // sync pode ser mais lento com batch grande
  sendTimeout: Duration(seconds: 10),
));
```

### 11.2. Rate limits ativos

| Endpoint | Limite | Escopo |
|---|---|---|
| `POST /auth/face-login` | 5/min | Por IP |
| `POST /attendance/check-in` | 10/min | Por usuário |
| `POST /biometric/verify` | 10/min | Por usuário |
| `POST /auth/reset-device` | 3/min | Por usuário |
| `POST /auth/logout` | 10/min | Por usuário |
| `GET /auth/session` | 60/min | Por usuário |

Todos retornam `429` com `Retry-After: <segundos>`.

### 11.3. Headers customizados aceitos

- `X-Clinic-Id: <guid>` — clínica ativa no contexto da request. Aplicável em `/api/attendance/status`, `/api/shifts/me/today` e endpoints admin. Se ausente, backend usa a primeira clínica autorizada do usuário. Se apontar para clínica não autorizada, backend faz silent reject (200 vazio) ou 403 dependendo do endpoint (o backend está preparado para os dois casos).

---

## 12. Ambientes

| Ambiente | Base URL | Cognito |
|---|---|---|
| Produção | `https://api.laulab.com.br` | `us-east-1_0PARyV1xj` / `3g1hnk76ksd3cbt8aqlio0bb87` |
| Local (dev) | `http://localhost:5000` | Mesmo user pool de produção |

Para dev local: subir a stack com `docker compose up` no monorepo e apontar o app para `http://10.0.2.2:5000` (Android emulator) ou `http://localhost:5000` (iOS simulator).

---

## Contato

Backend: [equipe DutyHub]
Cognito e infra AWS: [equipe DevOps]

Docs relacionados:
- Guia completo de biometria: [`flutter-biometric-api.md`](flutter-biometric-api.md)
- Ata da reunião de integração: [`reuniao-integracao-24p7.md`](reuniao-integracao-24p7.md)

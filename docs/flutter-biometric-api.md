# API de Biometria Facial — Guia para Desenvolvedor Flutter

**Versao:** 1.1 (Sprint 3 + Face Login + Device Lock)  
**Base URL:** `https://api.laulab.com.br`  
**Autenticacao:** Bearer Token (ID Token do Cognito) — exceto face-login que e anonimo

---

## Visao Geral do Fluxo

```
┌────────────────────────────────────────────────────────────────────┐
│                          App Flutter                                │
│                                                                    │
│  PRIMEIRO ACESSO:                                                  │
│  1. Tela de email → usuario informa email                          │
│  2. Camera captura selfie → gera embedding (MobileFaceNet)         │
│  3. POST /api/auth/face-login { email, embedding, deviceId }       │
│  4. Backend: verifica face + registra device → retorna tokens      │
│  5. App salva tokens no Secure Storage                             │
│                                                                    │
│  ACESSOS SEGUINTES:                                                │
│  1. Face ID/Touch ID → desbloqueia Secure Storage                  │
│  2. GET /api/auth/session → valida se token ainda e valido         │
│  3. Se expirou: usa refresh token ou repete face-login             │
│                                                                    │
│  CHECK-IN:                                                         │
│  1. POST /api/biometric/verify → confirma identidade               │
│  2. POST /api/attendance/check-in (biometricValidated: true)       │
└────────────────────────────────────────────────────────────────────┘
```

---

## Autenticacao

Todas as requisicoes usam o **ID Token** do Cognito como Bearer:

```
Authorization: Bearer <id_token>
```

O ID Token contem claims customizados injetados pela Lambda pre-token:
- `roles`: array de roles (AdminGlobal, AdminClinica, Medico, Enfermeiro, Tecnico)
- `clinicIds`: array de GUIDs das clinicas autorizadas

**Cognito Pool:** `us-east-1_0PARyV1xj`  
**Client ID:** `3g1hnk76ksd3cbt8aqlio0bb87`

---

## Endpoints

### 0. Face Login (Sem Token — Anonimo)

Login usando email + verificacao facial. **Disponivel apenas para profissionais** (Medico, Enfermeiro, Tecnico).
Administradores devem usar login email/senha via Cognito SDK.

O dispositivo e registrado automaticamente no primeiro login.

> **Pre-requisito:** O admin deve ter chamado `POST /api/auth/setup-face-login/{userId}` para
> habilitar o face-login para o profissional, e o profissional deve ter face enrollment ativo.

```
POST /api/auth/face-login
Content-Type: application/json
```

**Request:**
```json
{
  "email": "medico@exemplo.com",
  "embedding": [0.012, -0.045, 0.089, ... ],  // 128 floats da selfie
  "deviceId": "a1b2c3d4-unique-device-id",
  "platform": "android",                       // ou "ios"
  "deviceModel": "Samsung Galaxy S24"          // opcional, para admin
}
```

**Response 200 (sucesso):**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJl...",
  "expiresIn": 3600,
  "userId": "a1b2c3d4-...",
  "email": "medico@exemplo.com",
  "name": "Dr. Joao Silva"
}
```

**Response 401 (falha na verificacao):**
```json
{
  "message": "Verificação facial falhou. Tente novamente.",
  "confidence": 0.32
}
```

**Response 403 (device bloqueado):**
```json
{
  "message": "Sua conta está vinculada a outro dispositivo...",
  "code": "DEVICE_LOCKED",
  "currentDevice": {
    "platform": "ios",
    "model": "iPhone 15 Pro",
    "registeredAt": "2026-07-01T10:00:00Z"
  }
}
```

> **IMPORTANTE:** No primeiro login bem-sucedido, o device e registrado automaticamente.
> Logins subsequentes de um device diferente sao bloqueados (403 DEVICE_LOCKED).

---

### 0.1. Reset Device (Self-Service)

O proprio profissional desvincula seu device (precisa estar logado).

```
POST /api/auth/reset-device
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "reason": "Troca de celular"
}
```

**Response 204:** Device desvinculado com sucesso.

> Apos desvincular, o proximo face-login registra o novo device automaticamente.

---

### 0.2. Reset Device (Admin)

Admin desvincula o device de um profissional.

```
POST /api/auth/reset-device/{userId}
Authorization: Bearer <token_admin>
Content-Type: application/json
```

**Request:**
```json
{
  "reason": "Profissional reportou celular roubado"
}
```

**Response 204:** Device desvinculado.

---

### 0.3. Historico de Desvinculos (Admin — Auditoria)

```
GET /api/auth/device-audit/{userId}
Authorization: Bearer <token_admin>
```

**Response 200:**
```json
[
  {
    "id": "guid",
    "userId": "user-guid",
    "oldDeviceId": "device-123",
    "platform": "android",
    "deviceModel": "Samsung Galaxy S23",
    "unlinkedBy": "self",
    "reason": "Troca de celular",
    "unlinkedAt": "2026-07-10T15:30:00Z"
  },
  {
    "id": "guid",
    "userId": "user-guid",
    "oldDeviceId": "device-456",
    "platform": "ios",
    "deviceModel": "iPhone 14",
    "unlinkedBy": "admin:admin-guid",
    "reason": "Celular roubado reportado pelo profissional",
    "unlinkedAt": "2026-06-20T09:00:00Z"
  }
]
```

---

### 1. Validar Sessao

Verifica se o token e valido e retorna informacoes do usuario.  
Usar no app launch para decidir se precisa re-login.

```
GET /api/auth/session
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "userId": "a1b2c3d4-...",
  "email": "medico@exemplo.com",
  "name": "Dr. Joao Silva",
  "roles": ["Medico"],
  "clinicIds": ["guid-clinica-1"]
}
```

**Response 401:** Token invalido ou expirado.

---

### 2. Verificar Status de Enrollment

Checa se o usuario ja cadastrou a face. Usar para decidir se mostra tela de enrollment.

```
GET /api/biometric/status
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "enrolled": true
}
```

---

### 3. Cadastrar Face (Self-Enroll)

O profissional cadastra sua propria face. O embedding e gerado localmente no app.

```
POST /api/biometric/enroll/me
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "embedding": [0.012, -0.045, 0.089, ... ],  // 128 floats
  "photoBase64": "data:image/jpeg;base64,/9j/4A..."  // opcional, para auditoria
}
```

**Response 201:**
```json
{
  "id": "enrollment-guid",
  "userId": "user-guid",
  "isActive": true,
  "createdAt": "2026-07-11T14:30:00Z",
  "hasPhoto": true
}
```

**Response 400:**
```json
{
  "message": "Embedding must be 128-dimensional."
}
```

---

### 4. Verificar Face (Check-in)

Compara a selfie do check-in contra o embedding cadastrado.

```
POST /api/biometric/verify
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "embedding": [0.015, -0.042, 0.091, ... ]  // 128 floats da selfie ao vivo
}
```

**Response 200:**
```json
{
  "isMatch": true,
  "confidence": 0.87
}
```

**Response 404:**
```json
{
  "message": "No face enrollment found. Please enroll first."
}
```

**Logica no app:**
- Se `isMatch == true` e `confidence >= 0.6`: prosseguir com check-in
- Se `isMatch == false`: mostrar mensagem de erro, permitir nova tentativa
- Se 404: redirecionar para tela de enrollment

---

### 5. Deletar Enrollment (LGPD)

Permite ao profissional remover seus dados biometricos.

```
DELETE /api/biometric/enroll/me
Authorization: Bearer <token>
```

**Response 204:** Enrollment desativado com sucesso (sem body).

---

### 6. Check-in com Validacao Biometrica

Apos a verificacao facial, enviar o check-in com a flag `biometricValidated`.

```
POST /api/attendance/check-in
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "shiftId": "guid-do-plantao",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "deviceId": "device-unique-id",
  "biometricValidated": true
}
```

**Response 200:**
```json
{
  "id": "attendance-guid",
  "userId": "user-guid",
  "shiftId": "shift-guid",
  "clinicId": "clinic-guid",
  "checkInTime": "2026-07-11T08:00:00Z",
  "biometricValidated": true
}
```

**Response 400 (biometria obrigatoria):**
```json
{
  "message": "Verificação biométrica obrigatória. Realize a verificação facial antes do check-in."
}
```

> **IMPORTANTE:** Se o usuario tem face enrollment cadastrada, o backend **rejeita** check-in com `biometricValidated: false`. Isso impede bypass da verificacao por app modificado.

---

## Endpoints Administrativos

Estes endpoints requerem role `AdminClinica` ou `AdminGlobal`.

### Habilitar Face-Login para Profissional (OBRIGATORIO)

Configura o profissional para usar face-login. Deve ser chamado apos criar o usuario.
Sem isso, o `POST /api/auth/face-login` retorna 401.

```
POST /api/auth/setup-face-login/{userId}
Authorization: Bearer <token_admin>
```

**Response 204:** Configurado com sucesso.

**Response 400:**
```json
{
  "message": "Face-login só pode ser configurado para profissionais (Médico, Enfermeiro, Técnico)."
}
```

### Fluxo Completo de Onboarding de Profissional

```
1. Admin cria usuario (POST /api/users)
2. Admin habilita face-login: POST /api/auth/setup-face-login/{userId}
3. Admin cadastra face: POST /api/biometric/enroll/{userId}
4. Profissional abre o app → informa email → selfie → logado!
```

### Cadastrar Face de Profissional (Admin)

```
POST /api/biometric/enroll/{userId}
Authorization: Bearer <token_admin>
```

Request/Response: mesmo formato do self-enroll.

### Recadastrar Face

Desativa todos os enrollments anteriores e cria um novo.

```
POST /api/biometric/re-enroll/{userId}
Authorization: Bearer <token_admin>
```

### Listar Enrollments (Auditoria)

```
GET /api/biometric/enrollments/{userId}
Authorization: Bearer <token_admin>
```

**Response 200:**
```json
[
  {
    "id": "guid-1",
    "userId": "user-guid",
    "isActive": true,
    "createdAt": "2026-07-11T14:30:00Z",
    "hasPhoto": true
  },
  {
    "id": "guid-2",
    "userId": "user-guid",
    "isActive": false,
    "createdAt": "2026-06-15T10:00:00Z",
    "hasPhoto": false
  }
]
```

---

## Geracao de Embeddings no Flutter

### Biblioteca Recomendada

Usar **google_mlkit_face_detection** + **tflite_flutter** com modelo MobileFaceNet:

```yaml
# pubspec.yaml
dependencies:
  google_mlkit_face_detection: ^0.11.0
  tflite_flutter: ^0.10.4
  camera: ^0.10.5
```

### Modelo

- **MobileFaceNet** (ou FaceNet) — gera embedding de 128 dimensoes
- Download: modelo `.tflite` (~5MB) embeddado no app em `assets/models/`
- Input: face cropada 112x112 pixels (normalizada 0-1)
- Output: `Float32List` de 128 valores

### Fluxo de Geracao

```dart
// Pseudocodigo
class FaceEmbeddingService {
  late Interpreter _interpreter;

  Future<void> init() async {
    _interpreter = await Interpreter.fromAsset('assets/models/mobilefacenet.tflite');
  }

  Future<Float32List> generateEmbedding(CameraImage image, Face face) async {
    // 1. Crop face region from image
    final cropped = cropFace(image, face.boundingBox);

    // 2. Resize to 112x112
    final resized = resizeImage(cropped, 112, 112);

    // 3. Normalize pixel values to [0, 1]
    final normalized = normalizePixels(resized);

    // 4. Run inference
    final output = Float32List(128);
    _interpreter.run(normalized, output);

    // 5. L2 normalize the embedding
    return l2Normalize(output);
  }
}
```

### Dicas de Implementacao

1. **Liveness detection simples:** pedir para o usuario piscar ou virar a cabeca antes de capturar
2. **Qualidade da imagem:** verificar iluminacao e nitidez antes de gerar embedding
3. **Multiplos angulos no enrollment:** capturar 2-3 fotos (frente, leve esquerda, leve direita) e cadastrar cada uma como enrollment separado — melhora o match rate
4. **Cache do embedding:** nao cachear embeddings localmente por seguranca
5. **Timeout:** definir timeout de 10s para a camera + geracao de embedding

---

## Endpoints Auxiliares

### Clinica Mais Proxima

Retorna as clinicas autorizadas ordenadas por distancia do profissional.
Usado pelo app para sugerir em qual clinica o profissional esta.

```
GET /api/clinics/nearest?latitude=-23.55&longitude=-46.63&limit=5
Authorization: Bearer <token>
```

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

**Logica no app:**
- Chamar ao abrir tela de check-in
- Se `withinRadius == true`: habilitar check-in nessa clinica
- Se todas `withinRadius == false`: mostrar aviso "Você não está próximo de nenhuma unidade"

---

### Resumo de Presenca

Agregacao de dados de presenca para o profissional. Usado na home e relatorios.

```
GET /api/attendance/summary?from=2026-07-01&to=2026-07-31
Authorization: Bearer <token>
```

Parametros `from` e `to` sao opcionais. Sem eles, retorna tudo.

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

---

## Codigos de Erro Comuns

| HTTP | Codigo | Significado | Acao no App |
|------|--------|-------------|-------------|
| 400 | — | Embedding invalido (nao e 128-dim) | Verificar modelo TFLite |
| 400 | — | Biometria obrigatoria | Redirecionar para tela de verificacao |
| 401 | — | Token expirado/invalido | Refresh token ou re-login |
| 404 | — | Sem enrollment | Redirecionar para enrollment |
| 409 | ACTIVE_CHECKIN_EXISTS | Ja tem plantao ativo | Mostrar info do plantao ativo |

---

## Configuracoes

| Parametro | Valor | Descricao |
|-----------|-------|-----------|
| Embedding size | 128 floats | Padrao FaceNet/MobileFaceNet |
| Match threshold | 0.6 (60%) | Configuravel no backend |
| Modelo recomendado | MobileFaceNet | ~5MB, roda local no device |
| Camera | Frontal | Selfie para verificacao |

---

## Seguranca

- Embeddings sao armazenados no servidor (PostgreSQL), nao no device
- A verificacao roda no backend (cosine similarity) — o app nao decide match
- O flag `biometricValidated` e enforcement server-side — nao adianta forjar
- Enrollments podem ser desativados pelo admin a qualquer momento
- LGPD: profissional pode deletar seus dados biometricos via `DELETE /api/biometric/enroll/me`
- **Device Lock:** apenas 1 smartphone ativo por usuario — impede compartilhamento de conta
- **Auditoria de desvinculo:** todo reset de device e registrado com quem fez (self/admin), motivo e timestamp
- Face-login nao usa senha — a face e o unico fator de autenticacao alem do email
- **Face-login e exclusivo para profissionais** (Medico, Enfermeiro, Tecnico) — Admins usam email/senha
- O admin deve chamar `setup-face-login` antes que o profissional consiga usar face-login

---

## Device Lock — Como funciona

1. **Primeiro login:** device e registrado automaticamente (deviceId + platform + model)
2. **Mesmo device:** login liberado normalmente
3. **Device diferente:** bloqueado com 403 `DEVICE_LOCKED`
4. **Para trocar:**
   - Profissional: `POST /api/auth/reset-device` (precisa estar logado no device atual)
   - Admin: `POST /api/auth/reset-device/{userId}` (via painel admin)
5. **Auditoria:** todo desvinculo gera registro em `DeviceUnlinkAudit`

### DeviceId no Flutter

```dart
import 'package:device_info_plus/device_info_plus.dart';

Future<String> getDeviceId() async {
  final deviceInfo = DeviceInfoPlugin();
  if (Platform.isAndroid) {
    final android = await deviceInfo.androidInfo;
    return android.id; // android_id — unico por device+app
  } else if (Platform.isIOS) {
    final ios = await deviceInfo.iosInfo;
    return ios.identifierForVendor ?? '';  // unico por vendor+device
  }
  throw UnsupportedError('Platform not supported');
}
```

```yaml
# pubspec.yaml
dependencies:
  device_info_plus: ^10.1.0
```

---

*Documento gerado em Julho 2026 — Sprint 3 PlantonHub*

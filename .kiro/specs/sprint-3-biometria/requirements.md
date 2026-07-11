# Sprint 3 — Biometria

**Deadline:** 16/07/2026
**Esforço:** 2-3 dias
**Dependência:** Sprint 2 (Cognito)

---

## Objetivo

Implementar validação biométrica no momento do check-in/check-out, conforme o mock original (tela com oval + animação). Duas camadas: WebAuthn (device biometric) como baseline + UI visual do mock.

---

## Requisitos

### 1. WebAuthn como MFA no Cognito

- [ ] 1.1 Habilitar WebAuthn como MFA factor no User Pool
- [ ] 1.2 Fluxo de registro: profissional cadastra biometria do device na tela de Ajustes
- [ ] 1.3 Fluxo de login: após email+senha, Cognito pede segundo fator (fingerprint/Face ID)
- [ ] 1.4 Token emitido com claim `amr: ["mfa", "webauthn"]`
- [ ] 1.5 Fallback pra quem não tem device compatível: TOTP ou email OTP

### 2. UI — Step de Biometria no Check-in

- [ ] 2.1 Antes de confirmar check-in, abrir overlay com oval + câmera (visual do mock)
- [ ] 2.2 Usar `navigator.credentials.get()` pra solicitar biometria do device
- [ ] 2.3 Animação de loading: "Identificando...", "Confirmando identidade..."
- [ ] 2.4 Se sucesso: fechar overlay, prosseguir com o check-in (biometricValidated = true)
- [ ] 2.5 Se falha/cancelado: mostrar erro, permitir retry ou cancelar
- [ ] 2.6 Se device não suporta WebAuthn: skip automático (biometricValidated = false, backend marca flag)

### 3. Backend — Leitura do Claim

- [ ] 3.1 No `CheckInAsync`: ler `biometricValidated` do request (vem do frontend)
- [ ] 3.2 Alternativa melhor: verificar claim `amr` do token JWT do Cognito
- [ ] 3.3 Se `amr` contém `webauthn` → `biometricValidated = true` automático
- [ ] 3.4 Anti-fraude: `AntiFraudDetector` já marca `NoBiometric` quando `false`

### 4. Face Recognition Local (Opcional — fase 2)

- [ ] 4.1 Instalar `face-api.js` (~3MB)
- [ ] 4.2 Tela de cadastro facial na Ajustes (captura + gera embedding + salva local)
- [ ] 4.3 No check-in: abre câmera → detecta rosto → compara embedding → match/reject
- [ ] 4.4 Funciona offline (modelo + embedding ficam em IndexedDB)
- [ ] 4.5 Threshold de similaridade configurável

### 5. Testes

- [ ] 5.1 E2E: mock do WebAuthn no Playwright (Playwright suporta `cdp.webAuthn`)
- [ ] 5.2 Unit: hook `useBiometricAuth()` com mock do navigator.credentials
- [ ] 5.3 Integration: check-in com `biometricValidated: true/false` e verificar flag no audit

---

## Prompt pra próxima sessão

> "Sprint 3 — Biometria. Spec em .kiro/specs/sprint-3-biometria/requirements.md. Cognito já está configurado (Sprint 2). Começa pelo WebAuthn como MFA e depois a UI com oval do mock original."

# Sprint 1 — Infraestrutura AWS & CI

## Contexto

O 24p7 está funcionando localmente (docker-compose) com 426 testes passando (v0.1).
Esta spec cobre o deploy em AWS no free tier + CI pipeline pra rodar testes automaticamente.

## Requisitos

### 1. AWS CLI & Bootstrap

- [ ] 1.1 Instalar AWS CLI v2 no Windows
- [ ] 1.2 Configurar credenciais IAM (access key + secret)
- [ ] 1.3 Instalar CDK CLI (`npm install -g aws-cdk`)
- [ ] 1.4 Bootstrap CDK na conta (`cdk bootstrap aws://ACCOUNT/us-east-1`)

### 2. CDK Stack — Infraestrutura

- [ ] 2.1 Criar projeto CDK TypeScript em `infrastructure/`
- [ ] 2.2 RDS PostgreSQL (db.t4g.micro, single-AZ, 20GB) — free tier 12 meses
- [ ] 2.3 App Runner service: API .NET (imagem do ECR)
- [ ] 2.4 App Runner service ou S3+CloudFront: Frontend (SPA estática)
- [ ] 2.5 ECR repositories (api + frontend)
- [ ] 2.6 Route 53 hosted zone + DNS records pro domínio
- [ ] 2.7 ACM certificate (SSL/HTTPS) pra domínio + wildcard
- [ ] 2.8 Secrets Manager ou SSM Parameter Store pra connection strings e JWT secret
- [ ] 2.9 Upstash Redis (externo, free tier) — configurar connection string como env var

### 3. Cognito User Pool

- [ ] 3.1 Criar User Pool com email como username
- [ ] 3.2 Configurar password policy (mínimo 8 chars, upper+lower+number)
- [ ] 3.3 Criar App Client (SPA, sem secret)
- [ ] 3.4 Criar Groups: Medico, Enfermeiro, Tecnico, AdminClinica, AdminGlobal
- [ ] 3.5 Pre-token-generation Lambda: injeta claim `clinicIds` (lê do DynamoDB ou RDS)
- [ ] 3.6 Configurar hosted UI ou custom domain pra login (opcional)
- [ ] 3.7 Criar usuários iniciais (AdminGlobal + médico teste)

### 4. Backend — Dual-mode Auth

- [ ] 4.1 Adicionar validação de JWT do Cognito no middleware (segundo issuer válido)
- [ ] 4.2 TenantService: aceitar claims tanto do formato próprio quanto do Cognito
- [ ] 4.3 Manter auth próprio funcionando em paralelo (login local pra dev)
- [ ] 4.4 Variável de ambiente `AUTH_MODE=dual|cognito|local` pra controlar

### 5. CI Pipeline (GitHub Actions)

- [ ] 5.1 Workflow `ci.yml`: trigger em push/PR pra main
- [ ] 5.2 Job 1: Backend unit tests (`dotnet test PlantonHub.UnitTests`)
- [ ] 5.3 Job 2: Backend property tests (`dotnet test PlantonHub.PropertyTests`)
- [ ] 5.4 Job 3: Backend integration tests (Testcontainers + PostgreSQL)
- [ ] 5.5 Job 4: Frontend vitest (`npm run test`)
- [ ] 5.6 Job 5: Frontend E2E (Playwright contra docker-compose up)
- [ ] 5.7 Job 6: Build + push imagens pro ECR (só na main, pós-testes)
- [ ] 5.8 Job 7: Deploy via App Runner auto-deploy (trigger ECR push)
- [ ] 5.9 Branch protection: require CI pass antes de merge

### 6. Validação Final

- [ ] 6.1 App acessível via `https://24p7.laulab.com`
- [ ] 6.2 Login funciona (auth local)
- [ ] 6.3 Check-in/check-out funciona com dados reais
- [ ] 6.4 CI roda em <5min e bloqueia PRs quebradas
- [ ] 6.5 Custo estimado confirmado (<$15/mês no App Runner)

## Decisões Técnicas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| IaC | CDK TypeScript | Preferência do dev, type-safe, bom pra AWS-first |
| Compute | App Runner | Mais simples que ECS, auto-scale, sem ALB separado |
| Frontend hosting | S3 + CloudFront | Grátis (free tier), performance global, SPA-friendly |
| DB | RDS PostgreSQL t4g.micro | Free tier 12 meses, mesmo engine do local |
| Cache | Upstash Redis (externo) | Free tier 10k req/dia, zero infra AWS extra |
| Auth | Cognito (dual-mode) | Free 50k MAU, MFA grátis, WebAuthn built-in |
| CI | GitHub Actions | Já usa GitHub, free tier 2000 min/mês |
| Region | us-east-1 | Mais serviços no free tier |

## Custo Estimado

| Serviço | Custo/mês |
|---------|-----------|
| App Runner (API, idle) | ~$8 |
| S3 + CloudFront (Frontend) | $0 (free tier) |
| RDS PostgreSQL | $0 (free tier 12 meses) |
| Cognito | $0 (free tier 50k MAU) |
| Upstash Redis | $0 (free tier) |
| Route 53 | $0.50 |
| ECR | $0 (500MB free) |
| GitHub Actions | $0 (2000 min/mês free) |
| **Total** | **~$8-13/mês** |

Com $120 de crédito: **~9-15 meses cobertos**.

## Pré-requisitos

- [x] App rodando local (docker-compose) — v0.1 taggeada
- [x] Repo no GitHub
- [ ] AWS CLI instalado e configurado
- [ ] Domínio próprio: `laulab.com` (subdomínio `24p7.laulab.com`)
- [ ] Node.js 20+ no host (pra CDK CLI)

# SES → Cognito: cutover do remetente de email

Guia para trocar o remetente dos emails do Cognito (convite, verificação de
email e reset de senha) do padrão da AWS (`no-reply@verificationemail.com`)
para o domínio próprio (`no-reply@24p7.med.br`) via Amazon SES.

## O que já está pronto

- Domínio **`24p7.med.br` verificado no SES** (DKIM SUCCESS), região **us-east-1**.
- Pedido de produção do SES submetido — **caso AWS `178546132900196`**.
- O CDK do Cognito **ainda não** aponta pro SES (usa o remetente padrão). É de
  propósito: enquanto o SES está em **sandbox**, ele só entrega pra endereços
  verificados; trocar antes da aprovação quebraria o convite pra usuário novo.
- O código do switch já está **escrito e comentado** em
  `infrastructure/lib/cognito-stack.ts` (bloco `email: cognito.UserPoolEmail.withSES(...)`).

## Passo 0 — Só continue DEPOIS que a AWS aprovar a produção

O que falta é sair do sandbox. Isso depende de **responder o caso
`178546132900196`** no [AWS Support Center](https://console.aws.amazon.com/support/home)
(há um texto pronto no histórico do projeto) e a AWS liberar (~24h).

Confirme a liberação:

```
aws sesv2 get-account --region us-east-1 --query "{Prod:ProductionAccessEnabled, Max24h:SendQuota.Max24HourSend}"
```

Só prossiga quando **`Prod` = `true`** (a quota `Max24h` pula de `200` para
dezenas de milhares). Se ainda for `false`, **pare aqui** e aguarde.

## Passo 1 — Ativar o SES no CDK

Em `infrastructure/lib/cognito-stack.ts`, no `new cognito.UserPool(this,
"DutyHubUserPool", { ... })`, **descomente** o bloco `email` (logo após
`accountRecovery`):

```typescript
email: cognito.UserPoolEmail.withSES({
  fromEmail: "no-reply@24p7.med.br",
  fromName: "24p7",
  sesRegion: "us-east-1",
  sesVerifiedDomain: "24p7.med.br",
}),
```

Isso é uma **atualização** do User Pool (UpdateUserPool) — **não recria nada**:
usuários, grupos, clients e templates ficam intactos.

## Passo 2 — Deploy

```
cd infrastructure
npx cdk deploy DutyHub-Cognito --exclusively --require-approval never
```

## Passo 3 — Verificar

1. No Admin OS, use **"Reenviar convite"** num usuário pendente (ou crie um
   usuário de teste com um email seu).
2. Confirme que o email chega **de `no-reply@24p7.med.br`** (antes vinha de
   `no-reply@verificationemail.com`).

## Se o email NÃO chegar após o deploy

Causa provável: a identidade SES precisa **autorizar o Cognito** a enviar.
Crie um arquivo `cognito-ses-policy.json`:

```json
{
  "Version": "2008-10-17",
  "Statement": [
    {
      "Sid": "AllowCognitoToSend",
      "Effect": "Allow",
      "Principal": { "Service": "cognito-idp.amazonaws.com" },
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "arn:aws:ses:us-east-1:569206841715:identity/24p7.med.br"
    }
  ]
}
```

Aplique e teste o reenvio de novo:

```
aws ses put-identity-policy --identity 24p7.med.br --policy-name CognitoSend --policy file://cognito-ses-policy.json --region us-east-1
```

## Reverter (se precisar)

Comente de novo o bloco `email` no `cognito-stack.ts` e rode
`npx cdk deploy DutyHub-Cognito --exclusively` — volta pro remetente padrão da AWS.

## Notas

- Os templates de email (convite/verificação/reset) já estão configurados no
  `cognito-stack.ts` e continuam funcionando — só muda **quem** envia.
- Monitore bounce/complaint no console do SES (SES → Reputation metrics);
  mantenha as taxas baixas.
- Sender e domínio de links podem diferir (o sender é `24p7.med.br`, DKIM
  assinado; alguns links nos templates apontam pra `app.laulab.com.br`). Isso
  é ok pra entrega. Se quiser alinhar tudo em 24p7, troque os links depois.

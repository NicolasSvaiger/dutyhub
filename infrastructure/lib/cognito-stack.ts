import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface CognitoStackProps extends cdk.StackProps {
  dbEndpoint: string;
  dbSecretArn: string;
  customAuthSecretArn: string;
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly backendClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    // User Pool
    this.userPool = new cognito.UserPool(this, "DutyHubUserPool", {
      userPoolName: "dutyhub-users",
      selfSignUpEnabled: false, // Admin creates users
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Invite email sent by AdminCreateUser (see CognitoAuthService.
      // CreateInvitedUserAsync). Without this, Cognito falls back to its
      // default English, unstyled "Your temporary password" template. The
      // body MUST contain the {username} and {####} placeholders (Cognito
      // rejects the template otherwise) — {####} is the temporary password.
      // Rendered as HTML by Cognito. NOTE: the sender address stays
      // no-reply@verificationemail.com until Amazon SES is wired up via
      // emailConfiguration (separate change, needs a verified domain).
      userInvitation: {
        emailSubject: "24p7 - suas credenciais de acesso",
        // Email-safe HTML (tables + inline styles). The 24p7 pin logo is a
        // hosted PNG (email clients do not render SVG) served from the
        // frontend bucket at app.laulab.com.br/email/pin-24p7.png — it lives
        // in frontend/public/email/ so every frontend build/deploy keeps it
        // present (the CI `s3 sync --delete` would otherwise remove a
        // stray object). Header gradient has a solid #7e14ff fallback for
        // Outlook. Body MUST keep {username} and {####} (Cognito rejects the
        // template otherwise); {####} is the temporary password. Text is
        // accent-free on purpose — a customer-facing email that cannot be
        // previewed after sending is safer without multibyte chars.
        emailBody: [
          '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eceff3;margin:0;padding:0;">',
          '<tr><td align="center" style="padding:24px 12px;">',
          '<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">',
          // Header
          '<tr><td align="center" style="background-color:#7e14ff;background-image:linear-gradient(135deg,#6d10e8 0%,#863bff 55%,#9d5bff 100%);padding:40px 24px 34px;">',
          '<img src="https://app.laulab.com.br/email/pin-24p7.png" width="84" height="84" alt="24p7" style="display:block;border:0;outline:none;" />',
          '<div style="margin-top:16px;font-size:30px;font-weight:800;letter-spacing:0.5px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">24p7</div>',
          '<div style="margin-top:4px;font-size:13px;color:rgba(255,255,255,0.82);font-family:Arial,Helvetica,sans-serif;">Tecnologia para quem nao para</div>',
          "</td></tr>",
          // Body
          '<tr><td style="padding:36px 40px 8px;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">',
          '<h1 style="margin:0 0 14px;font-size:21px;font-weight:800;color:#1a1a2e;">Bem-vindo ao 24p7</h1>',
          '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4b4b63;">Uma conta de acesso foi criada para voce. Use as credenciais abaixo para entrar pela primeira vez.</p>',
          '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f3ff;border:1px solid #ece7ff;border-radius:10px;margin:0 0 22px;">',
          '<tr><td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">',
          '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:#8a7fb0;margin:0 0 4px;">Login</div>',
          '<div style="font-size:15px;font-weight:700;color:#2a1a4a;margin:0 0 16px;word-break:break-all;">{username}</div>',
          '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:#8a7fb0;margin:0 0 4px;">Senha temporaria</div>',
          "<div style=\"font-size:18px;font-weight:800;letter-spacing:1px;color:#7e14ff;font-family:'Courier New',monospace;\">{####}</div>",
          "</td></tr></table>",
          '<p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:#4b4b63;">No primeiro acesso voce precisara definir uma nova senha.</p>',
          '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">',
          '<a href="https://app.laulab.com.br/login" style="display:inline-block;background:#7e14ff;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:9px;font-family:Arial,Helvetica,sans-serif;">Acessar o 24p7</a>',
          "</td></tr></table>",
          "</td></tr>",
          // Footer
          '<tr><td style="padding:26px 40px 30px;font-family:Arial,Helvetica,sans-serif;">',
          '<div style="border-top:1px solid #eeeeee;padding-top:18px;">',
          '<p style="margin:0;font-size:12px;line-height:1.6;color:#9a9ab0;">Se voce nao esperava este e-mail, pode ignora-lo com seguranca.</p>',
          '<p style="margin:8px 0 0;font-size:12px;color:#b6b6c8;">&copy; 2026 24p7</p>',
          "</div>",
          "</td></tr>",
          "</table>",
          "</td></tr></table>",
        ].join(""),
        smsMessage: "24p7: seu login e {username} e a senha temporaria e {####}",
      },
      // Verification / password-reset email. Cognito uses this same template
      // for the "esqueci minha senha" code (ForgotPasswordPage ->
      // cognitoForgotPassword) and for email-attribute verification. Style
      // CODE => body MUST contain {####} (the code). Same visual shell as the
      // invite so every 24p7 email looks consistent. Sender stays
      // no-reply@verificationemail.com until SES is configured.
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: "24p7 - seu codigo de verificacao",
        emailBody: [
          '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eceff3;margin:0;padding:0;">',
          '<tr><td align="center" style="padding:24px 12px;">',
          '<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">',
          // Header
          '<tr><td align="center" style="background-color:#7e14ff;background-image:linear-gradient(135deg,#6d10e8 0%,#863bff 55%,#9d5bff 100%);padding:40px 24px 34px;">',
          '<img src="https://app.laulab.com.br/email/pin-24p7.png" width="84" height="84" alt="24p7" style="display:block;border:0;outline:none;" />',
          '<div style="margin-top:16px;font-size:30px;font-weight:800;letter-spacing:0.5px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">24p7</div>',
          '<div style="margin-top:4px;font-size:13px;color:rgba(255,255,255,0.82);font-family:Arial,Helvetica,sans-serif;">Tecnologia para quem nao para</div>',
          "</td></tr>",
          // Body
          '<tr><td style="padding:36px 40px 8px;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">',
          '<h1 style="margin:0 0 14px;font-size:21px;font-weight:800;color:#1a1a2e;">Codigo de verificacao</h1>',
          '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4b4b63;">Recebemos uma solicitacao para a sua conta 24p7. Use o codigo abaixo para continuar.</p>',
          '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f3ff;border:1px solid #ece7ff;border-radius:10px;margin:0 0 22px;">',
          '<tr><td align="center" style="padding:22px 20px;font-family:Arial,Helvetica,sans-serif;">',
          '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:#8a7fb0;margin:0 0 8px;">Seu codigo</div>',
          "<div style=\"font-size:34px;font-weight:800;letter-spacing:8px;color:#7e14ff;font-family:'Courier New',monospace;\">{####}</div>",
          "</td></tr></table>",
          '<p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:#4b4b63;">Por seguranca, este codigo expira em alguns minutos.</p>',
          "</td></tr>",
          // Footer
          '<tr><td style="padding:26px 40px 30px;font-family:Arial,Helvetica,sans-serif;">',
          '<div style="border-top:1px solid #eeeeee;padding-top:18px;">',
          '<p style="margin:0;font-size:12px;line-height:1.6;color:#9a9ab0;">Se voce nao fez essa solicitacao, pode ignorar este e-mail com seguranca.</p>',
          '<p style="margin:8px 0 0;font-size:12px;color:#b6b6c8;">&copy; 2026 24p7</p>',
          "</div>",
          "</td></tr>",
          "</table>",
          "</td></tr></table>",
        ].join(""),
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // SPA Client (frontend — admin login with email/password)
    this.userPoolClient = this.userPool.addClient("DutyHubSpaClient", {
      userPoolClientName: "dutyhub-spa",
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          "https://app.laulab.com.br/callback",
          "http://localhost:3000/callback",
          "http://localhost:5173/callback",
        ],
        logoutUrls: [
          "https://app.laulab.com.br/login",
          "http://localhost:3000/login",
          "http://localhost:5173/login",
        ],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Backend Client (server-side — face-login via CUSTOM_AUTH flow)
    this.backendClient = this.userPool.addClient("DutyHubBackendClient", {
      userPoolClientName: "dutyhub-backend",
      generateSecret: true, // Backend client uses a secret
      authFlows: {
        custom: true, // CUSTOM_AUTH for face-login (no passwords)
        adminUserPassword: true, // Fallback for admin operations
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Groups
    // GestorPublico = gestor de Prefeitura (Sprint 7A). Paralelo aos demais,
    // não subordinado ao AdminGlobal. Portal /prefeitura só aceita esse role.
    const groups = ["Medico", "Enfermeiro", "Tecnico", "AdminClinica", "AdminGlobal", "GestorPublico"];
    for (const group of groups) {
      new cognito.CfnUserPoolGroup(this, `Group${group}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group,
        description: `Grupo ${group}`,
      });
    }

    // ----- Custom Auth Challenge Lambdas -----
    // These implement passwordless auth: the backend proves identity via HMAC challenge

    const defineAuthChallenge = new lambda.Function(this, "DefineAuthChallenge", {
      functionName: "dutyhub-define-auth-challenge",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "define-auth-challenge.handler",
      code: lambda.Code.fromAsset("lambda/custom-auth"),
      timeout: cdk.Duration.seconds(5),
    });

    const createAuthChallenge = new lambda.Function(this, "CreateAuthChallenge", {
      functionName: "dutyhub-create-auth-challenge",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "create-auth-challenge.handler",
      code: lambda.Code.fromAsset("lambda/custom-auth"),
      timeout: cdk.Duration.seconds(5),
      environment: {
        CUSTOM_AUTH_SECRET_ARN: props.customAuthSecretArn,
      },
    });

    const verifyAuthChallenge = new lambda.Function(this, "VerifyAuthChallenge", {
      functionName: "dutyhub-verify-auth-challenge",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "verify-auth-challenge.handler",
      code: lambda.Code.fromAsset("lambda/custom-auth"),
      timeout: cdk.Duration.seconds(5),
    });

    // Grant CreateAuthChallenge access to the secret
    const customAuthSecret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(
      this, "CustomAuthSecret", props.customAuthSecretArn
    );
    customAuthSecret.grantRead(createAuthChallenge);

    // Attach Custom Auth triggers to User Pool
    this.userPool.addTrigger(
      cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE,
      defineAuthChallenge
    );
    this.userPool.addTrigger(
      cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE,
      createAuthChallenge
    );
    this.userPool.addTrigger(
      cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE,
      verifyAuthChallenge
    );

    // ----- Pre-token-generation Lambda -----
    const preTokenLambda = new lambda.Function(this, "PreTokenGeneration", {
      functionName: "dutyhub-pre-token-generation",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/pre-token-generation"),
      timeout: cdk.Duration.seconds(10),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.dbSecurityGroup],
      environment: {
        DB_ENDPOINT: props.dbEndpoint,
        // Password injected directly from Secrets Manager at deploy time
        // This avoids needing a VPC Endpoint for Secrets Manager ($14/mo)
        DB_PASSWORD: cdk.SecretValue.secretsManager(props.dbSecretArn, {
          jsonField: "password",
        }).unsafeUnwrap(),
      },
    });

    // Attach Lambda trigger to User Pool
    this.userPool.addTrigger(
      cognito.UserPoolOperation.PRE_TOKEN_GENERATION_CONFIG,
      preTokenLambda
    );

    // Outputs
    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "BackendClientId", {
      value: this.backendClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "UserPoolDomain", {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
  }
}

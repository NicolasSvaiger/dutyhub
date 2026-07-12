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
    const groups = ["Medico", "Enfermeiro", "Tecnico", "AdminClinica", "AdminGlobal"];
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

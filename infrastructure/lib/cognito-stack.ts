import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface CognitoStackProps extends cdk.StackProps {
  dbEndpoint: string;
  dbSecretArn: string;
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

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

    // App Client (SPA, no secret)
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

    // Groups
    const groups = ["Medico", "Enfermeiro", "Tecnico", "AdminClinica", "AdminGlobal"];
    for (const group of groups) {
      new cognito.CfnUserPoolGroup(this, `Group${group}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group,
        description: `Grupo ${group}`,
      });
    }

    // Pre-token-generation Lambda
    const preTokenLambda = new lambda.Function(this, "PreTokenGeneration", {
      functionName: "dutyhub-pre-token-generation",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/pre-token-generation"),
      timeout: cdk.Duration.seconds(10),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.dbSecurityGroup],
      environment: {
        DB_ENDPOINT: props.dbEndpoint,
        DB_PASSWORD: "tBwPzDMs8Ubkggxy=6A=39CS=8IiW0",
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

    new cdk.CfnOutput(this, "UserPoolDomain", {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
  }
}

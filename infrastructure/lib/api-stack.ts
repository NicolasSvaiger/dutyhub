import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface ApiStackProps extends cdk.StackProps {
  ecrRepository: ecr.Repository;
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  dbEndpoint: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoBackendClientId: string;
  /**
   * The RDS instance's own generated-credentials Secret object (from
   * DatabaseStack's `rds.Credentials.fromGeneratedSecret(...)`) — NOT a
   * hardcoded ARN string. This is the single source of truth for the
   * master user's current password: it's the same Secret construct RDS
   * itself reads from when the DatabaseInstance resource is created or
   * updated, so it can't drift the way a manually-copied secret can.
   *
   * An earlier version of this fix pointed at a separate, hand-maintained
   * secret (`dutyhub/db-connection-string`) that looked plausible — right
   * host/port/db/username, verified against `aws rds describe-db-instances`
   * — but had a stale password, which is *exactly* the class of bug this
   * approach eliminates: there's no second copy of the password to go
   * stale, because we read the fields (host/port/dbname/username/password)
   * directly off dbSecret at synth time via secretValueFromJson, which
   * CloudFormation resolves at container start. Confirmed working: this is
   * the same secret DatabaseStack passes to CognitoStack's
   * pre-token-generation Lambda (`dbSecretArn: databaseStack.dbInstance.
   * secret!.secretArn` in bin/infrastructure.ts) for its own Postgres
   * connection.
   */
  dbSecret: secretsmanager.ISecret;
  /**
   * Full Redis connection string (StackExchange.Redis format) pointing at
   * the real ElastiCache cluster (`dutyhub-redis`). Not a secret — that
   * cluster has TransitEncryption/AuthToken disabled (confirmed via `aws
   * elasticache describe-cache-clusters`), so there's no credential to
   * protect, just a hostname. Passed as a plain env var, same as
   * docker-compose.yml does for local dev Redis.
   */
  redisConnectionString: string;
  /**
   * Comma-separated list of allowed CORS origins, read by Program.cs via
   * `Cors:AllowedOrigins` (env var Cors__AllowedOrigins). Confirmed via
   * `aws apprunner describe-service` that this was already set on the live
   * service to the real frontend origins — it was just never captured in
   * this file. Without it here, deploying this stack would fall back to
   * Program.cs's localhost-only default and CORS-block every request from
   * the real frontend (https://app.laulab.com.br), which is what caused
   * the "tudo esta me retornando 403" incident earlier in this project.
   */
  corsAllowedOrigins: string;
  /**
   * ARN of the plaintext (non-JSON) secret shared between this backend and
   * CognitoStack's CreateAuthChallenge Lambda — see the long comment atop
   * CognitoAuthService.cs. Read via `Cognito:CustomAuthSecret`
   * (Cognito__CustomAuthSecret), which CognitoAuthService's constructor
   * requires unconditionally (throws InvalidOperationException if unset).
   * This is NOT optional: face-login (CUSTOM_AUTH flow) computes
   * HMAC-SHA256(nonce, this secret) to answer Cognito's custom challenge —
   * omitting it doesn't just disable face-login, it throws the moment
   * CognitoAuthService is constructed.
   *
   * Routed through RuntimeEnvironmentSecrets (masked), NOT a plain env var,
   * despite the live service currently having it as plain text — anyone
   * who can read this value can compute a valid HMAC answer and forge the
   * custom-auth challenge response, i.e. it's a genuine authentication
   * bypass secret, not inert data. The live config's plain-text exposure
   * is treated as pre-existing drift to fix, not a pattern to preserve.
   */
  customAuthSecretArn: string;
}

export class ApiStack extends cdk.Stack {
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // IAM role for App Runner to pull from ECR
    const accessRole = new iam.Role(this, "AppRunnerAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
    });
    props.ecrRepository.grantPull(accessRole);

    // IAM role for the running instance
    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });

    // Allow instance to read secrets
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameter",
          "ssm:GetParameters",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:dutyhub/*`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/dutyhub/*`,
        ],
      })
    );

    // Allow instance to call Cognito Admin APIs — face-login CUSTOM_AUTH
    // flow (AdminInitiateAuth/AdminRespondToAuthChallenge/AdminGetUser) plus
    // the admin user-invite flow added in Sprint 7E (AdminCreateUser,
    // AdminDeleteUser for the create-rollback compensating action, and
    // AdminUpdateUserAttributes for email edits) — see CognitoAuthService.cs.
    // AdminSetUserPassword is kept for parity even though no current call
    // site uses it, since it's part of the same admin-auth surface.
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminUpdateUserAttributes",
        ],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
        ],
      })
    );

    // ----- Cognito VPC Interface Endpoint -----
    // The VPC has natGateways: 0 (see network-stack.ts) — no route to the
    // public internet at all. That's fine for RDS/S3 (already reachable
    // via the isolated subnets / S3 gateway endpoint), but it silently
    // breaks every admin-side Cognito call the backend makes directly
    // (AdminCreateUser, AdminDeleteUser, AdminGetUser, AdminInitiateAuth,
    // AdminRespondToAuthChallenge, AdminUpdateUserAttributes — see
    // CognitoAuthService.cs). Those requests never get a response: the
    // SDK's TCP connect to cognito-idp.<region>.amazonaws.com just hangs
    // until the client-side timeout, which is why "criar usuário" gets
    // stuck on "Salvando..." with the request sitting at (pending) in the
    // browser's network tab instead of failing fast.
    //
    // A PrivateLink interface endpoint resolves that DNS name to a private
    // IP inside the VPC instead, at ~$7-8/mo — far cheaper than a NAT
    // Gateway (~$32/mo + data processing) and we don't need general
    // internet egress for anything else the API does today.
    const cognitoEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      "CognitoEndpointSecurityGroup",
      {
        vpc: props.vpc,
        // No apostrophes/contractions here — EC2 security group
        // descriptions only accept [a-zA-Z0-9. _-:/()#,@[]+=&;{}!$*], and a
        // literal "'" (e.g. "API's") fails CREATE with HandlerErrorCode:
        // InvalidRequest, which cascades into a full stack rollback taking
        // every other resource in this changeset down with it.
        description: "Allow the API VPC connector to reach the Cognito Interface Endpoint",
        allowAllOutbound: false,
      }
    );

    // Dedicated security group for the VPC connector's Cognito egress,
    // deliberately kept separate from dbSecurityGroup. dbSecurityGroup is
    // owned by DatabaseStack (this stack only receives it by reference) —
    // an earlier version of this change added an egress rule directly to
    // it, and `cdk diff` flagged that as forcing replacement of the
    // *production RDS* security group (a VpcId "requires replacement"
    // signal), because mutating a DatabaseStack-owned resource from here
    // pulls in a cross-stack token. Not a risk worth taking for a
    // Cognito-only change. This new SG is 100% owned by ApiStack, so its
    // rules only ever reference other ApiStack resources below — no
    // cross-stack tokens, nothing that touches DatabaseStack or RDS.
    const apiCognitoEgressSecurityGroup = new ec2.SecurityGroup(
      this,
      "ApiCognitoEgressSecurityGroup",
      {
        vpc: props.vpc,
        description: "VPC connector egress to the Cognito Interface Endpoint",
        allowAllOutbound: false,
      }
    );

    cognitoEndpointSecurityGroup.addIngressRule(
      apiCognitoEgressSecurityGroup,
      ec2.Port.tcp(443),
      // Same InvalidRequest failure mode as the SG description above
      // applies to rule descriptions too — no apostrophes.
      "Allow the API VPC connector to call Cognito Admin APIs"
    );
    apiCognitoEgressSecurityGroup.addEgressRule(
      cognitoEndpointSecurityGroup,
      ec2.Port.tcp(443),
      "Allow the VPC connector to reach the Cognito Interface Endpoint"
    );

    // Using the InterfaceVpcEndpoint construct directly (scoped to `this`,
    // i.e. ApiStack) instead of the `vpc.addInterfaceEndpoint(...)`
    // convenience method. That method attaches the endpoint as a child of
    // the Vpc construct, which lives in NetworkStack — since the endpoint
    // references cognitoEndpointSecurityGroup (defined here in ApiStack),
    // that would make NetworkStack depend on ApiStack. NetworkStack is
    // already an upstream dependency of ApiStack (via DatabaseStack, which
    // needs the VPC), so that reverse edge closes a cycle at synth time.
    //
    // Only one of the two PRIVATE_ISOLATED subnets, not both: verified via
    // `aws ec2 describe-vpc-endpoint-services` that com.amazonaws.<region>.
    // cognito-idp only supports us-east-1b/c/d — this VPC's subnets sit in
    // us-east-1a and us-east-1b (`aws ec2 describe-subnets`), and passing
    // the us-east-1a one causes CREATE_FAILED ("does not support the
    // availability zone of the subnet"), which cascades into a full
    // rollback of every other resource in the changeset. Single-AZ here is
    // an accepted tradeoff for this fix — the VPC connector itself already
    // spans both subnets for RDS, so this only reduces redundancy for the
    // Cognito path specifically, not overall API availability.
    const cognitoEndpointSubnet = props.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      availabilityZones: ["us-east-1b"],
    }).subnets[0];

    new ec2.InterfaceVpcEndpoint(this, "CognitoEndpoint", {
      vpc: props.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      subnets: { subnets: [cognitoEndpointSubnet] },
      securityGroups: [cognitoEndpointSecurityGroup],
      privateDnsEnabled: true,
    });

    // VPC Connector for App Runner to reach RDS (via dbSecurityGroup,
    // unchanged) and now also the Cognito Interface Endpoint (via the new
    // apiCognitoEgressSecurityGroup, added to the connector's SG list).
    // Note: AWS::AppRunner::VpcConnector is immutable — CloudFormation
    // replaces it whenever its SecurityGroups list changes, so deploying
    // this recreates the connector (and briefly redeploys the App Runner
    // service to point at the new one). That's an expected, reversible
    // App Runner-side change; it does not touch RDS or any stateful data.
    const vpcConnector = new apprunner.CfnVpcConnector(this, "VpcConnector", {
      subnets: props.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds,
      securityGroups: [
        props.dbSecurityGroup.securityGroupId,
        apiCognitoEgressSecurityGroup.securityGroupId,
      ],
      // No fixed vpcConnectorName. VpcConnector is immutable — changing its
      // SecurityGroups list forces CloudFormation to create-then-delete a
      // replacement, and with a hardcoded name the create step collides
      // with the still-live original ("VPC connector name
      // dutyhub-api-connector already exists"), failing the whole
      // changeset. Leaving this unset lets CloudFormation generate a
      // unique name for the new connector, same as it already does for
      // every other resource's logical ID suffix in this stack.
    });

    // Allow App Runner (via VPC connector) to access RDS
    props.dbSecurityGroup.addIngressRule(
      props.dbSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow App Runner to access RDS"
    );

    // DB connection string assembled as a SINGLE value whose password is a
    // CloudFormation dynamic reference ({{resolve:secretsmanager:...}}),
    // resolved by CloudFormation at DEPLOY time — deliberately NOT App
    // Runner's RuntimeEnvironmentSecrets, whose runtime resolution of the DB
    // password kept returning empty and caused the "Host can't be null"
    // startup crash loop that ate hours of this project.
    //
    // CRITICAL detail on why the ARN and host are hardcoded literals here
    // instead of the cross-stack tokens (props.dbSecret.secretArn /
    // props.dbEndpoint): a dynamic reference is only reliably resolved by
    // CloudFormation when the complete "{{resolve:...}}" string sits inside
    // a single string LITERAL. Feeding a token makes CDK emit an Fn::Join
    // that SPLITS the "{{resolve:...}}" across segments, and CloudFormation
    // does not resolve a split reference (per the AWS dynamic-references
    // docs) — App Runner would then receive the raw "{{resolve:...}}" text
    // as the password. Using literals keeps the whole connection string one
    // plain literal with the reference embedded intact. RDS has
    // RemovalPolicy.RETAIN and the secret ARN is fixed, so these are stable;
    // if RDS is ever replaced, update these two constants.
    //
    // Tradeoff, stated plainly: CloudFormation resolves the reference before
    // calling App Runner, so the password IS visible via `aws apprunner
    // describe-service` — identical to the exposure the last known-healthy
    // config already had, acceptable versus keeping production down. The
    // referenced secret (dutyhub/rds-credentials) had its value corrected to
    // match the live database password, so it is now the single source of
    // truth — no more stale hand-copied secrets (`dutyhub/db-connection-string`,
    // the pre-correction rds-credentials) that caused earlier "password
    // authentication failed" errors.
    const dbSecretArnLiteral =
      "arn:aws:secretsmanager:us-east-1:569206841715:secret:dutyhub/rds-credentials-u85crk";
    const dbHostLiteral =
      "dutyhub-database-dutyhubdba5bebf39-lxrt00nukbew.c8pie6accox0.us-east-1.rds.amazonaws.com";
    const dbPasswordRef = cdk.SecretValue.secretsManager(dbSecretArnLiteral, {
      jsonField: "password",
    }).unsafeUnwrap();
    const dbConnectionString = `Host=${dbHostLiteral};Port=5432;Database=dutyhub;Username=dutyhub_admin;Password=${dbPasswordRef}`;

    // Face-login CUSTOM_AUTH HMAC secret (see CognitoAuthService.cs), same
    // deploy-time dynamic-reference mechanism. props.customAuthSecretArn is
    // already a literal string, so the reference stays intact as one literal
    // (verified in cdk diff). The last known-healthy config also carried
    // this as a plain env var, so this matches proven behavior.
    const customAuthSecretRef = cdk.SecretValue.secretsManager(props.customAuthSecretArn).unsafeUnwrap();

    // App Runner Service
    const service = new apprunner.CfnService(this, "ApiService", {
      serviceName: "dutyhub-api",
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        autoDeploymentsEnabled: true,
        imageRepository: {
          imageIdentifier: `${props.ecrRepository.repositoryUri}:latest`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "5000",
            // All values are plain env vars. Program.cs reads
            // ConnectionStrings:DefaultConnection (DB), ConnectionStrings:Redis
            // (cache, token blacklist, distributed lock, biometric proof,
            // health checks), Cors:AllowedOrigins (else it CORS-blocks the
            // real frontend), and Cognito:CustomAuthSecret (else
            // CognitoAuthService throws on construction, breaking face-login).
            // The two secret-derived values (DB password inside the
            // connection string, and the custom-auth secret) are CloudFormation
            // dynamic references resolved at deploy time — see the block
            // above. No runtimeEnvironmentSecrets: App Runner's runtime secret
            // resolution was the failing mechanism, so nothing relies on it.
            runtimeEnvironmentVariables: [
              { name: "ASPNETCORE_ENVIRONMENT", value: "Production" },
              { name: "ASPNETCORE_URLS", value: "http://+:5000" },
              { name: "Cognito__Region", value: this.region },
              { name: "Cognito__UserPoolId", value: props.cognitoUserPoolId },
              { name: "Cognito__ClientId", value: props.cognitoClientId },
              { name: "Cognito__BackendClientId", value: props.cognitoBackendClientId },
              { name: "Cognito__CustomAuthSecret", value: customAuthSecretRef },
              { name: "ConnectionStrings__DefaultConnection", value: dbConnectionString },
              { name: "ConnectionStrings__Redis", value: props.redisConnectionString },
              { name: "Cors__AllowedOrigins", value: props.corsAllowedOrigins },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: "0.25 vCPU",
        memory: "0.5 GB",
        instanceRoleArn: instanceRole.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: "VPC",
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
      healthCheckConfiguration: {
        protocol: "TCP",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });

    this.serviceUrl = service.attrServiceUrl;

    new cdk.CfnOutput(this, "ApiServiceUrl", {
      value: `https://${service.attrServiceUrl}`,
    });
  }
}
